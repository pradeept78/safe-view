document.getElementById('year').textContent = new Date().getFullYear();

function addDetail(box, label, value, href) {
  if (!value) return;
  const title = document.createElement('b');
  title.textContent = label;
  const line = document.createElement('div');
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = value;
    line.append(link);
  } else {
    line.textContent = value;
  }
  box.append(title, line);
}

fetch('/api/public').then((res) => res.json()).then((info) => {
  document.querySelectorAll('[data-setting]').forEach((node) => {
    if (info[node.dataset.setting]) node.textContent = info[node.dataset.setting];
  });

  const number = (info.whatsapp || '').replace(/\D/g, '');
  if (number) {
    document.querySelectorAll('[data-whatsapp]').forEach((link) => {
      link.href = `https://wa.me/${number}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.hidden = false;
    });
    document.querySelectorAll('[data-no-whatsapp]').forEach((link) => { link.hidden = true; });
  }

  const box = document.getElementById('details');
  addDetail(box, 'Phone', info.phone, `tel:${(info.phone || '').replace(/[^+\d]/g, '')}`);
  addDetail(box, 'Email', info.email, `mailto:${info.email}`);
  addDetail(box, 'Address', info.address);
  addDetail(box, 'Opening hours', info.opening_hours);
  box.hidden = box.childElementCount === 0;
}).catch(() => {});

// Header turns solid once the page scrolls.
const nav = document.getElementById('nav');
const updateNav = () => nav.classList.toggle('solid', window.scrollY > 24);
window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

// Sections fade in as they reach the screen.
const revealed = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  revealed.forEach((node) => observer.observe(node));
} else {
  revealed.forEach((node) => node.classList.add('in'));
}

// Choosing a service tile fills in the enquiry form.
document.querySelectorAll('[data-service]').forEach((tile) => {
  tile.addEventListener('click', () => {
    document.getElementById('serviceSelect').value = tile.dataset.service;
  });
});

document.getElementById('enquiry').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button');
  const message = document.getElementById('formMsg');
  const show = (text, kind) => {
    message.className = kind;
    message.textContent = text;
  };
  button.disabled = true;
  try {
    const res = await fetch('/api/enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Please try again');
    form.reset();
    show('Thank you. We will call you back soon.', 'ok');
  } catch (error) {
    show(error.message === 'Failed to fetch' ? 'Could not send. Please check your connection.' : error.message, 'bad');
  } finally {
    button.disabled = false;
  }
});
