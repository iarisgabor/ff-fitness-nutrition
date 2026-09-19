// WhatsApp — citit și trimis, prin TELEFON, nu prin vreun API al WhatsApp.
//
// De ce așa: WhatsApp nu are API pentru contul tău personal. Cele două alternative sunt un
// client neoficial de tip WhatsApp Web (are nevoie de un proces pornit non-stop, deci de un
// server, și riscă blocarea numărului) sau API-ul oficial de Business (alt număr, nu vezi
// conversațiile tale). Aici mergem pe a treia cale: aplicația Android citește NOTIFICĂRILE de
// la WhatsApp și răspunde prin exact același mecanism prin care răspunzi tu din bara de
// notificări. Nimic neoficial, nimic de ținut pornit — telefonul e oricum pornit.
//
// Ce se poate și ce nu, în consecință (limitele sunt ale mecanismului, nu ale codului):
//   - se văd doar mesajele SOSITE cât timp telefonul e pornit și aplicația are acces la
//     notificări; nu există istoric și nu se văd mesajele trimise de tine;
//   - un mesaj dintr-o conversație care ți-a scris recent se poate trimite direct (răspuns în
//     fir, prin notificare);
//   - un mesaj NOU, către cineva care nu ți-a scris, deschide WhatsApp cu textul pregătit —
//     apeși tu „trimite". Android nu lasă o aplicație să apese butonul altei aplicații.

export const CITESTE_MESAJE_WHATSAPP_TOOL = {
  name: 'citeste_mesaje_whatsapp',
  description:
    'Citește mesajele primite pe WhatsApp, cele mai noi primele, cu expeditor și oră. ' +
    'Folosește-o la "ce mesaje am pe WhatsApp", "cine mi-a scris", "ce mi-a scris X". ' +
    'Vede doar mesajele sosite cât timp telefonul a fost pornit — nu are istoric vechi și ' +
    'nu vede ce ai trimis tu.',
  input_schema: {
    type: 'object',
    properties: {
      limita: {
        type: 'number',
        description: 'Câte mesaje să întoarcă, cele mai noi. Implicit 15, maximum 50.',
      },
      de_la: {
        type: 'string',
        description:
          'Opțional: numele (sau o parte din numele) expeditorului ori al grupului, dacă ' +
          'utilizatorul întreabă despre o anumită persoană.',
      },
    },
    required: [],
    additionalProperties: false,
  },
};

export const TRIMITE_MESAJ_WHATSAPP_TOOL = {
  name: 'trimite_mesaj_whatsapp',
  description:
    'Trimite un mesaj pe WhatsApp, în română. Dacă persoana i-a scris recent (apare în ' +
    'citeste_mesaje_whatsapp), mesajul pleacă direct, ca răspuns în acea conversație. ' +
    'Altfel, dacă dai un număr de telefon, se deschide WhatsApp pe telefon cu mesajul scris ' +
    'deja, iar utilizatorul apasă trimite — spune-i asta când se întâmplă.',
  input_schema: {
    type: 'object',
    properties: {
      destinatar: {
        type: 'string',
        description:
          'Numele persoanei sau al grupului, EXACT cum apare în citeste_mesaje_whatsapp. ' +
          'Preferă-l ori de câte ori persoana a scris recent — doar așa pleacă mesajul singur.',
      },
      numar: {
        type: 'string',
        description:
          'Numărul de telefon cu prefix de țară (ex. +40712345678), pentru cineva care NU a ' +
          'scris recent. Folosit doar dacă destinatar lipsește sau nu e găsit.',
      },
      text: {
        type: 'string',
        description: 'Mesajul de trimis, în română, scris ca și cum l-ar scrie utilizatorul.',
      },
    },
    required: ['text'],
    additionalProperties: false,
  },
};

function cereAgent(agent) {
  if (!agent) {
    const err = new Error('Unealta are nevoie de agent');
    err.code = 'AGENT_REQUIRED';
    throw err;
  }
}

export async function citesteMesajeWhatsapp(env, input, agent) {
  cereAgent(agent);

  const limita = Math.min(Math.max(Number(input.limita) || 15, 1), 50);
  const deLa = (input.de_la || '').trim();
  const mesaje = await agent.mesajeWhatsapp(limita, deLa);

  if (mesaje.length === 0) {
    return {
      mesaje: [],
      // Mesajul contează: „n-ai mesaje" și „nu am cum să le văd" sunt lucruri complet diferite
      // pentru om, iar modelul nu are cum să le deosebească dintr-o listă goală.
      nota: deLa
        ? `Nu am niciun mesaj de la „${deLa}".`
        : 'Nu am niciun mesaj WhatsApp. Fie n-a scris nimeni de când e telefonul pornit, fie ' +
          'accesul la notificări nu e pornit pentru aplicație (Setări → Notificări → Acces la notificări).',
    };
  }

  return { mesaje, total: mesaje.length };
}

export async function trimiteMesajWhatsapp(env, input, agent) {
  cereAgent(agent);

  const text = (input.text || '').trim();
  if (!text) {
    const err = new Error('Nu am ce trimite — lipsește textul mesajului.');
    err.code = 'WHATSAPP_NO_TEXT';
    throw err;
  }

  const destinatar = (input.destinatar || '').trim();
  const numar = (input.numar || '').replace(/[^\d+]/g, '');
  if (!destinatar && !numar) {
    const err = new Error('Spune-mi cui să trimit: un nume din conversațiile recente sau un număr.');
    err.code = 'WHATSAPP_NO_TARGET';
    throw err;
  }

  return agent.trimiteWhatsapp({ destinatar, numar, text });
}
