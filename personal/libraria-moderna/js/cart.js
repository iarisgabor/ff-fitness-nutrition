// Coș de cumpărături — persistat în localStorage. Demo, fără plată reală.

const CART_KEY = "libraria-moderna-cart";

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

function addToCart(slug, qty = 1) {
  const cart = getCart();
  cart[slug] = (cart[slug] || 0) + qty;
  saveCart(cart);
}

function setQty(slug, qty) {
  const cart = getCart();
  if (qty <= 0) {
    delete cart[slug];
  } else {
    cart[slug] = qty;
  }
  saveCart(cart);
}

function removeFromCart(slug) {
  const cart = getCart();
  delete cart[slug];
  saveCart(cart);
}

function clearCart() {
  saveCart({});
}

function getCartCount() {
  const cart = getCart();
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}

function getCartItems() {
  const cart = getCart();
  return Object.entries(cart)
    .map(([slug, qty]) => {
      const book = getBookBySlug(slug);
      if (!book) return null;
      return { book, qty, subtotal: book.price * qty };
    })
    .filter(Boolean);
}

function getCartTotal() {
  return getCartItems().reduce((sum, item) => sum + item.subtotal, 0);
}

function updateCartBadge() {
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    const count = getCartCount();
    el.textContent = count;
    el.classList.toggle("is-visible", count > 0);
  });
}

document.addEventListener("DOMContentLoaded", updateCartBadge);
