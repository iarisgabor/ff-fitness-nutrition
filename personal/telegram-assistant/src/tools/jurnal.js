// Jurnalul acțiunilor ireversibile: ce s-a făcut în lumea din afară, și ce se mai poate lua înapoi.
//
// Perechea porții din confirmare.js. Poarta oprește ce n-a fost aprobat; jurnalul ține minte ce
// s-a întâmplat totuși, fiindcă un „da" dat în grabă e la fel de irevocabil ca unul dat greșit.
//
// Un singur lucru se poate chiar reface: un eveniment șters din calendar. Un apel a sunat deja
// un telefon, iar un mesaj citit de celălalt nu se poate necitit — pentru alea jurnalul e o urmă,
// nu un buton de anulare, iar `refa_actiunea` o spune așa cum e în loc să se prefacă.

import { recreateCalendarEvent } from './calendar.js';

function cereAgent(agent) {
  if (agent) return;
  const err = new Error('Unealta are nevoie de agent');
  err.code = 'AGENT_REQUIRED';
  throw err;
}

export const CE_AI_FACUT_TOOL = {
  name: 'ce_ai_facut',
  description:
    'Ultimele acțiuni ireversibile pe care le-ai făcut (ștergeri din calendar, apeluri date, ' +
    'mesaje trimise), cu id-ul fiecăreia. Folosește-o când te întreabă ce ai făcut, sau când ' +
    'vrea să anuleze ceva și trebuie să afli despre ce e vorba înainte de `refa_actiunea`.',
  input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
};

export async function ceAiFacut(env, input, agent) {
  cereAgent(agent);
  const actiuni = await agent.jurnalRecent();
  if (actiuni.length === 0) {
    return { actiuni: [], nota: 'Nu ai făcut încă nicio acțiune din cele care se țin minte aici.' };
  }
  return { actiuni };
}

export const REFA_ACTIUNEA_TOOL = {
  name: 'refa_actiunea',
  description:
    'Încearcă să refacă o acțiune din jurnal, după id-ul ei (ia-l din `ce_ai_facut`, nu-l ' +
    'inventa). Merge DOAR pentru un eveniment șters din calendar, care se recreează. Un apel ' +
    'dat și un mesaj trimis nu se pot lua înapoi — pentru ele unealta îți va spune asta, iar tu ' +
    'trebuie să-i spui la fel de cinstit, fără să promiți că ai reparat ceva.',
  input_schema: {
    type: 'object',
    properties: {
      jurnal_id: { type: 'number', description: 'Id-ul acțiunii din `ce_ai_facut`.' },
    },
    required: ['jurnal_id'],
    additionalProperties: false,
  },
};

export async function refaActiunea(env, input, agent) {
  cereAgent(agent);
  const intrare = await agent.intrareJurnal(input.jurnal_id);

  if (!intrare) {
    return {
      refacut: false,
      nota: 'Nu există nicio acțiune cu id-ul ăsta în jurnal. Cheamă `ce_ai_facut` și ia id-ul de acolo.',
    };
  }

  // Refacerea a rulat deja. Fără verificarea asta, un al doilea „refă" ar crea o A DOUA copie a
  // aceluiași eveniment — iar omul ar avea în calendar două întâlniri identice în loc de una.
  if (intrare.refacut_la) {
    return {
      refacut: false,
      deja_refacut: true,
      ce_era: intrare.rezumat,
      nota: 'Asta a fost deja refăcută o dată. Evenimentul există deja în calendar — nu-l crea din nou.',
    };
  }

  if (!intrare.date_refacere) {
    return {
      refacut: false,
      ce_era: intrare.rezumat,
      nota:
        'Acțiunea asta nu se poate lua înapoi — un apel dat a sunat deja telefonul cuiva, iar un ' +
        'mesaj trimis a fost deja livrat. Spune-i asta simplu și întreabă-l dacă vrea să faci ' +
        'altceva în schimb (de exemplu un mesaj de lămurire).',
    };
  }

  const rezultat = await recreateCalendarEvent(env, intrare.date_refacere);
  await agent.marcheazaRefacut(input.jurnal_id);

  return {
    refacut: true,
    ce_era: intrare.rezumat,
    htmlLink: rezultat.htmlLink,
    nota:
      'Evenimentul a fost recreat, cu toate datele lui, dar are un ID NOU — e o copie fidelă, nu ' +
      'același rând înviat. Dacă era o singură apariție dintr-un eveniment care se repetă, acum e ' +
      'un eveniment de sine stătător. Spune-i asta dacă e cazul.',
  };
}
