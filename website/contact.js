(() => {
  const fallbackCompany = { physical_address: 'București–Ilfov', phone: '0762 093 915', email: 'contact@g-trots.ro' };

  function phoneDigits(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('0040')) digits = digits.slice(2);
    if (digits.startsWith('40')) return digits;
    if (digits.startsWith('0')) return `40${digits.slice(1)}`;
    return digits ? `40${digits}` : '40762093915';
  }

  function updateInteractiveCompany(input) {
    const company = { ...fallbackCompany, ...(input || {}) };
    const physicalAddress = String(company.physical_address || fallbackCompany.physical_address).trim();
    const query = encodeURIComponent(physicalAddress);
    const map = document.getElementById('contact-map');
    const mapLink = document.getElementById('contact-map-link');
    if (map) map.src = `https://www.google.com/maps?q=${query}&output=embed`;
    if (mapLink) mapLink.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
    document.querySelectorAll('[data-contact-phone-link]').forEach(link => { link.href = `tel:+${phoneDigits(company.phone)}`; });
    document.querySelectorAll('[data-contact-email-link]').forEach(link => { link.href = `mailto:${company.email || fallbackCompany.email}`; });
    return company;
  }

  let activeCompany = { ...fallbackCompany };
  Promise.resolve(window.GTrotsPublicConfigPromise)
    .then(config => { activeCompany = updateInteractiveCompany(config?.company); })
    .catch(() => { activeCompany = updateInteractiveCompany(fallbackCompany); });

  const form = document.getElementById('contact-whatsapp-form');
  form?.addEventListener('submit', event => {
    event.preventDefault();
    const name = document.getElementById('contact-name');
    const phone = document.getElementById('contact-phone');
    const service = document.getElementById('contact-service');
    const message = document.getElementById('contact-message');
    const status = document.getElementById('contact-form-status');
    const required = [name, service, message];
    required.forEach(field => field?.removeAttribute('aria-invalid'));
    const invalid = required.find(field => !String(field?.value || '').trim());
    if (invalid) {
      invalid.setAttribute('aria-invalid', 'true');
      invalid.focus();
      if (status) status.textContent = 'Completează câmpurile marcate pentru a pregăti mesajul.';
      return;
    }
    if (status) status.textContent = '';
    const lines = ['Salut, echipa G-Trots!', '', `Nume: ${name.value.trim()}`, phone.value.trim() ? `Telefon: ${phone.value.trim()}` : '', `Subiect: ${service.value.trim()}`, `Detalii: ${message.value.trim()}`].filter(Boolean);
    const whatsappUrl = `https://wa.me/${phoneDigits(activeCompany.phone)}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.GTrotsGoogle?.trackContact?.('whatsapp', {
      link_url: `https://wa.me/${phoneDigits(activeCompany.phone)}`,
      link_text: 'Pregătește mesajul pe WhatsApp',
      interaction_location: 'contact_form',
      service: String(service.value || '').trim().slice(0, 100)
    });
    window.location.href = whatsappUrl;
  });

  const revealItems = [...document.querySelectorAll('.contact-reveal')];
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealItems.forEach(item => item.classList.add('is-pending'));
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -8% 0px' });
    revealItems.forEach(item => observer.observe(item));
  }
})();
