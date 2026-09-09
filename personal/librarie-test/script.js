// Catalogul afișat pe pagină — id-urile trebuie să corespundă cu worker/catalog.js,
// fiindcă chat-ul recomandă cărți după `id`, nu după titlu.
const CATALOG = [
  { id: 'omul-care-plantat-copaci', title: 'Omul care plantat copaci', author: 'Jean Giono', genre: 'Ficțiune scurtă', price: '24 lei', desc: 'O poveste scurtă despre răbdare și fapte simple care schimbă o lume întreagă.', color: '#5c7a4e' },
  { id: 'micul-print', title: 'Micul Prinț', author: 'Antoine de Saint-Exupéry', genre: 'Clasic', price: '29 lei', desc: 'O fabulă despre ce contează cu adevărat, spusă simplu.', color: '#3f6b8a' },
  { id: 'norwegian-wood', title: 'Pădurea norvegiană', author: 'Haruki Murakami', genre: 'Ficțiune literară', price: '52 lei', desc: 'Roman melancolic despre iubire, pierdere și maturizare.', color: '#4a4458' },
  { id: 'mandrie-si-prejudecata', title: 'Mândrie și prejudecată', author: 'Jane Austen', genre: 'Romantism', price: '39 lei', desc: 'Clasic al romantismului, plin de umor și speranță.', color: '#a3556b' },
  { id: 'stapanul-inelelor', title: 'Stăpânul Inelelor', author: 'J.R.R. Tolkien', genre: 'Fantasy', price: '89 lei', desc: 'Epopee despre curaj și prietenie într-o lume întreagă de descoperit.', color: '#6b4a2a' },
  { id: 'dune', title: 'Dune', author: 'Frank Herbert', genre: 'Science fiction', price: '65 lei', desc: 'Politică, putere și supraviețuire pe o planetă deșertică.', color: '#a06a2e' },
  { id: 'fata-disparuta', title: 'Fata dispărută', author: 'Gillian Flynn', genre: 'Thriller', price: '45 lei', desc: 'Thriller psihologic cu răsturnări de situație.', color: '#2e2e33' },
  { id: 'sapiens', title: 'Sapiens: Scurtă istorie a omenirii', author: 'Yuval Noah Harari', genre: 'Non-ficțiune', price: '58 lei', desc: 'O privire de ansamblu asupra istoriei omenirii.', color: '#7a6a3f' },
  { id: 'puterea-obisnuintei', title: 'Puterea obișnuinței', author: 'Charles Duhigg', genre: 'Dezvoltare personală', price: '44 lei', desc: 'Cum se formează obiceiurile și cum le poți schimba.', color: '#2e6b6b' },
  { id: 'essentialism', title: 'Essentialism', author: 'Greg McKeown', genre: 'Dezvoltare personală', price: '48 lei', desc: 'Arta de a face mai puține lucruri, dar mai bine.', color: '#4e6b3f' },
  { id: 'curajul-de-a-nu-fi-pe-plac', title: 'Curajul de a nu fi pe plac', author: 'Ichiro Kishimi, Fumitake Koga', genre: 'Psihologie', price: '46 lei', desc: 'Un dialog despre eliberarea de nevoia de aprobare a celorlalți.', color: '#8a5a3f' },
  { id: 'meditatii', title: 'Meditații', author: 'Marcus Aurelius', genre: 'Filozofie', price: '35 lei', desc: 'Gânduri despre calm, control și acceptare.', color: '#555f6b' },
  { id: 'anul-gandirii-magice', title: 'Anul gândirii magice', author: 'Joan Didion', genre: 'Memorii', price: '42 lei', desc: 'O mărturie sinceră despre doliu și pierdere.', color: '#4a4a4a' },
  { id: 'jurnalul-lui-bridget-jones', title: 'Jurnalul lui Bridget Jones', author: 'Helen Fielding', genre: 'Comedie romantică', price: '38 lei', desc: 'Comedie ușoară și autoironică.', color: '#b9748a' },
];

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const CHAT_API_URL = isLocal
  ? 'http://localhost:8787/api/chat'
  : 'https://librarie-test-chat.iarisgabor.workers.dev/api/chat';

function renderCatalog() {
  const grid = document.getElementById('book-grid');
  grid.innerHTML = CATALOG.map((b) => `
    <article class="book-card" id="book-${b.id}" data-id="${b.id}">
      <div class="book-cover" style="background:${b.color}">${b.title}</div>
      <div class="book-info">
        <p class="book-title">${b.title}</p>
        <p class="book-author">${b.author}</p>
        <span class="book-genre">${b.genre}</span>
        <p class="book-desc">${b.desc}</p>
        <p class="book-price">${b.price}</p>
      </div>
    </article>
  `).join('');
}

function highlightBook(id) {
  document.querySelectorAll('.book-card.highlighted').forEach((el) => el.classList.remove('highlighted'));
  const card = document.getElementById(`book-${id}`);
  if (!card) return;
  card.classList.add('highlighted');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- Chat widget ---

const chatToggle = document.getElementById('chat-toggle');
const chatPanel = document.getElementById('chat-panel');
const chatClose = document.getElementById('chat-close');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const heroCta = document.getElementById('hero-cta');

let history = [];
let sending = false;

function openChat() {
  chatPanel.hidden = false;
  chatInput.focus();
  if (!chatMessages.children.length) {
    addMessage('assistant', 'Salut! Sunt librarul tău virtual. Spune-mi ce te frământă azi sau ce fel de carte cauți, și îți recomand ceva din raft.');
  }
}

function closeChat() {
  chatPanel.hidden = true;
}

chatToggle.addEventListener('click', () => {
  chatPanel.hidden ? openChat() : closeChat();
});
chatClose.addEventListener('click', closeChat);
heroCta.addEventListener('click', openChat);

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function addRecommendations(ids) {
  if (!ids.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'rec-cards';
  ids.forEach((id) => {
    const book = CATALOG.find((b) => b.id === id);
    if (!book) return;
    const card = document.createElement('div');
    card.className = 'rec-card';
    card.innerHTML = `<b>${book.title}</b><span>${book.author} · ${book.price}</span>`;
    card.addEventListener('click', () => highlightBook(id));
    wrap.appendChild(card);
  });
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (ids[0]) highlightBook(ids[0]);
}

function setSending(state) {
  sending = state;
  chatInput.disabled = state;
  chatForm.querySelector('.chat-send').disabled = state;
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || sending) return;

  addMessage('user', text);
  chatInput.value = '';
  setSending(true);

  const typingEl = addMessage('assistant typing', 'scrie...');

  try {
    const res = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, history }),
    });

    typingEl.remove();

    if (!res.ok) throw new Error('upstream_failed');
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    addMessage('assistant', data.reply);
    addRecommendations(data.recommended_ids || []);

    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: data.reply });
  } catch (err) {
    typingEl.remove();
    addMessage('system-error', 'Ceva n-a mers cum trebuie — încearcă din nou în câteva clipe.');
  } finally {
    setSending(false);
    chatInput.focus();
  }
});

renderCatalog();
