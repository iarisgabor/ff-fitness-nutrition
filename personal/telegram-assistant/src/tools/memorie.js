// Memoria de lungă durată: ce ține minte Jarvis între conversații.
//
// De ce există: istoricul e o fereastră de 20 de mesaje (HISTORY_WINDOW din agent.js). Tot ce e
// mai vechi dispare — inclusiv numele oamenilor din viața lui, ce-l preocupă, cum îi place să i
// se răspundă. Promptul îi cerea deja „ține minte", dar n-avea cu ce.
//
// Faptele NU se șterg singure și NU expiră. De-aia descrierea uneltei e formulată restrictiv:
// o memorie plină de „azi a mâncat pizza" e mai rea decât una goală, fiindcă tot ce e acolo
// ajunge în fiecare cerere către model, la preț plin (vezi comentariul despre cache din
// anthropic.js).
//
// Toate trei au nevoie de INSTANȚA agentului (scriu în SQL-ul Durable Object-ului), deci primesc
// `agent` ca al treilea argument — vezi comentariul din tools/index.js.

function cereAgent(agent) {
  if (agent) return;
  const err = new Error('Unealta are nevoie de agent');
  err.code = 'AGENT_REQUIRED';
  throw err;
}

export const TINE_MINTE_TOOL = {
  name: 'tine_minte',
  description:
    'Reține un lucru DURABIL despre utilizator sau despre viața lui, ca să-l știi și peste ' +
    'săptămâni, după ce conversația asta iese din istoric. Folosește-o din proprie inițiativă ' +
    'când afli ceva ce va fi adevărat și peste o lună: nume și relații (soție, copii, colegi, ' +
    'medic), preferințe stabile, decizii și angajamente pe termen lung, lucruri care îl ' +
    'preocupă, cum vrea să-i vorbești. Folosește-o și când îți cere explicit să ții minte ceva.\n' +
    'NU reține: ce s-a întâmplat azi, stări de moment, comenzi deja executate, ce ai căutat ' +
    'adineauri, detalii pe care le poți oricând citi din calendar sau din alte unelte. Dacă te ' +
    'întrebi dacă merită reținut, întreabă-te dacă ți-ar folosi peste o lună.\n' +
    'Scrie faptul ca o propoziție scurtă, de sine stătătoare, care se înțelege fără context ' +
    '(„Sora lui se numește Ana și e medic în Cluj", nu „sora lui e Ana").',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Faptul, ca o propoziție scurtă și de sine stătătoare, în română.',
      },
      cerut_de_el: {
        type: 'boolean',
        description:
          'true dacă utilizatorul ți-a cerut explicit să ții minte asta; false dacă tu ai decis ' +
          'că merită reținut.',
      },
    },
    required: ['text', 'cerut_de_el'],
    additionalProperties: false,
  },
};

export async function tineMinte(env, input, agent) {
  cereAgent(agent);
  const rezultat = await agent.tineMinte(input.text, input.cerut_de_el ? 'cerut' : 'auto');

  if (rezultat.duplicat) {
    return {
      ok: true,
      deja_stiut: true,
      id: rezultat.id,
      nota: 'Știai deja asta — nu am adăugat-o a doua oară. Nu-i spune că ai reținut-o acum.',
    };
  }
  return { ok: true, id: rezultat.id };
}

export const CE_TII_MINTE_TOOL = {
  name: 'ce_tii_minte',
  description:
    'Lista completă a lucrurilor reținute despre utilizator, cu id-urile lor. Folosește-o când ' +
    'te întreabă ce știi despre el, și înainte de `uita` dacă nu vezi id-ul faptei în memoria ' +
    'din promptul tău.',
  input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
};

export async function ceTiiMinte(env, input, agent) {
  cereAgent(agent);
  const fapte = await agent.faptele();
  if (fapte.length === 0) {
    return { fapte: [], nota: 'Nu ai reținut încă nimic despre el.' };
  }
  return { fapte };
}

export const UITA_TOOL = {
  name: 'uita',
  description:
    'Șterge definitiv o faptă reținută, după id. Id-urile sunt în paranteze în secțiunea ' +
    'MEMORIE din promptul tău, sau le poți lua din `ce_tii_minte`. NU inventa niciodată un id. ' +
    'Folosește-o când îți cere să uiți ceva, sau când o faptă s-a dovedit greșită ori s-a ' +
    'schimbat (atunci: uită-o pe cea veche și ține minte varianta nouă).',
  input_schema: {
    type: 'object',
    properties: {
      id: { type: 'number', description: 'Id-ul faptei de șters.' },
    },
    required: ['id'],
    additionalProperties: false,
  },
};

export async function uita(env, input, agent) {
  cereAgent(agent);
  const rezultat = await agent.uitaFapt(input.id);

  // Nu aruncă la id inexistent: „nu există" e un răspuns, nu o defecțiune, iar o excepție ar
  // ajunge la om ca mesaj de eroare (vezi anthropic.js, tool_result is_error).
  if (!rezultat.ok) {
    return {
      sters: false,
      nota:
        'Nu există nicio faptă cu id-ul ăsta. Cheamă `ce_tii_minte` ca să vezi lista reală și ' +
        'id-urile ei, apoi încearcă din nou.',
    };
  }
  return { sters: true, text: rezultat.text };
}
