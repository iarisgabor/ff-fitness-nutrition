package ro.bisericalogos.pulsul.nativ.data

import android.content.ContentResolver
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.BufferedSink
import okio.source
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

const val OFFLINE_MSG = "Ești offline. Modificarea nu a fost trimisă. Încearcă din nou după ce revine conexiunea."
const val NETWORK_MSG = "Nu am putut contacta serverul. Verifică conexiunea și încearcă din nou."

open class ApiError(message: String, val status: Int = 0) : Exception(message)
class NetworkError(message: String) : ApiError(message)
class UploadCancelled : ApiError("Urcare anulată.")

// Mesajele serverului sunt scrise pentru site, uneori cu „ — "; în aplicație devin propoziții.
fun dashless(s: String): String =
    Regex(" [—–] (\\p{L})").replace(s) { ". " + it.groupValues[1].uppercase() }

class Api(
    val base: String,
    private val session: Session,
    private val isOnline: () -> Boolean,
    private val onUnauthorized: () -> Unit,
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.MINUTES)
        .build()
    // citirea paginilor: rețeaua are 6 s, apoi se arată copia salvată (ca public/sw.js)
    private val pageClient = client.newBuilder().callTimeout(6, TimeUnit.SECONDS).build()

    private fun request(path: String): Request.Builder = Request.Builder().url(base + path).apply {
        session.token?.let { header("Authorization", "Bearer $it") }
    }

    private fun Request.Builder.writing() = header("Origin", base) // verificarea CSRF a Worker-ului

    private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
        enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) = cont.resume(response)
            override fun onFailure(call: Call, e: IOException) {
                if (!cont.isCancelled) cont.resumeWithException(e)
            }
        })
        cont.invokeOnCancellation { runCatching { cancel() } }
    }

    private fun errorFrom(res: Response, body: String): ApiError {
        if (res.code == 401) {
            onUnauthorized()
            return ApiError("Sesiunea a expirat. Autentifică-te din nou.", 401)
        }
        val msg = runCatching {
            (PulsJson.parseToJsonElement(body) as JsonObject)["error"]?.jsonPrimitive?.contentOrNull
        }.getOrNull()
        return ApiError(dashless(msg ?: "Eroare ${res.code}"), res.code)
    }

    private suspend fun execute(call: Call, writing: Boolean): String {
        val res = try {
            call.await()
        } catch (e: IOException) {
            if (call.isCanceled()) throw UploadCancelled()
            throw NetworkError(if (!isOnline() && writing) OFFLINE_MSG else NETWORK_MSG)
        }
        res.use {
            val body = it.body?.string().orEmpty()
            if (!it.isSuccessful) throw errorFrom(it, body)
            return body
        }
    }

    suspend fun getPage(path: String): String = withContext(Dispatchers.IO) {
        execute(pageClient.newCall(request(path).get().build()), writing = false)
    }

    suspend fun send(method: String, path: String, body: JsonElement? = null): String = withContext(Dispatchers.IO) {
        if (!isOnline()) throw NetworkError(OFFLINE_MSG)
        val rb = body?.toString()?.toRequestBody("application/json".toMediaType())
            ?: if (method == "GET") null else ByteArray(0).toRequestBody(null)
        execute(client.newCall(request(path).writing().method(method, rb).build()), writing = true)
    }

    suspend fun login(username: String, password: String): LoginReply = withContext(Dispatchers.IO) { loginIo(username, password) }

    private suspend fun loginIo(username: String, password: String): LoginReply {
        val body = PulsJson.encodeToString(JsonObject.serializer(), JsonObject(mapOf(
            "username" to kotlinx.serialization.json.JsonPrimitive(username),
            "password" to kotlinx.serialization.json.JsonPrimitive(password),
        )))
        val req = Request.Builder().url("$base/api/app/login").writing()
            .post(body.toRequestBody("application/json".toMediaType())).build()
        val res = try {
            client.newCall(req).await()
        } catch (e: IOException) {
            throw NetworkError(NETWORK_MSG)
        }
        res.use {
            val text = it.body?.string().orEmpty()
            if (!it.isSuccessful) {
                val msg = runCatching {
                    (PulsJson.parseToJsonElement(text) as JsonObject)["error"]?.jsonPrimitive?.contentOrNull
                }.getOrNull()
                throw ApiError(dashless(msg ?: "Eroare ${it.code}"), it.code)
            }
            return PulsJson.decodeFromString(LoginReply.serializer(), text)
        }
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        runCatching { client.newCall(request("/api/app/logout").writing().post(ByteArray(0).toRequestBody(null)).build()).await().close() }
        Unit
    }

    // Urcare ca pe site: corpul brut (nu multipart), cu Content-Length cunoscut — Worker-ul îl
    // cere, fiindcă fișierul curge direct în R2. `onCall` primește apelul, ca să poată fi anulat.
    suspend fun upload(
        path: String, resolver: ContentResolver, uri: Uri, size: Long, mime: String?,
        onCall: (Call) -> Unit, onProgress: (Float) -> Unit,
    ): String = withContext(Dispatchers.IO) {
        if (!isOnline()) throw NetworkError(OFFLINE_MSG)
        val body = object : RequestBody() {
            override fun contentType() = (mime ?: "application/octet-stream").toMediaTypeOrNull()
            override fun contentLength() = size
            override fun writeTo(sink: BufferedSink) {
                resolver.openInputStream(uri)!!.source().use { src ->
                    var sent = 0L
                    val buffer = okio.Buffer()
                    while (true) {
                        val read = src.read(buffer, 64 * 1024)
                        if (read == -1L) break
                        sink.write(buffer, read)
                        sent += read
                        onProgress(if (size > 0) (sent.toFloat() / size).coerceAtMost(1f) else 0f)
                    }
                }
            }
        }
        val call = client.newCall(request(path).writing().post(body).build())
        onCall(call)
        execute(call, writing = true)
    }

    suspend fun download(path: String, dest: File) = withContext(Dispatchers.IO) {
        val call = client.newCall(request(path).get().build())
        val res = try { call.await() } catch (e: IOException) { throw NetworkError(NETWORK_MSG) }
        res.use {
            if (!it.isSuccessful) throw errorFrom(it, "")
            dest.parentFile?.mkdirs()
            dest.outputStream().use { out -> it.body!!.byteStream().copyTo(out) }
        }
    }
}
