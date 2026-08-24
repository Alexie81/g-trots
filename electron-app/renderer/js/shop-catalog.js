(function () {
  const state = {
    categories: [],
    brands: [],
    manufacturers: [],
    loaded: false,
    loading: false,
    editingCategory: null,
    editingBrand: null,
    editingManufacturer: null,
    imageBase64: null,
    imageRemoved: false,
    deleteTarget: null,
  };

  const byId = (id) => document.getElementById(id);
  const categoryState = byId('shop-category-state');
  const brandState = byId('shop-brand-state');
  const manufacturerState = byId('shop-manufacturer-state');
  const categoryShell = byId('shop-category-table-shell');
  const brandShell = byId('shop-brand-table-shell');
  const manufacturerShell = byId('shop-manufacturer-table-shell');
  const categoryBody = byId('shop-category-table-body');
  const brandBody = byId('shop-brand-table-body');
  const manufacturerBody = byId('shop-manufacturer-table-body');
  const categoryModal = byId('shop-category-modal');
  const brandModal = byId('shop-brand-modal');
  const manufacturerModal = byId('shop-manufacturer-modal');
  const deleteModal = byId('shop-delete-modal');

  function toast(message, type = 'success') {
    window.BUSINESS_UI?.showToast?.(message, type);
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent.trim();
    button.disabled = busy;
    button.textContent = busy ? busyText : button.dataset.label;
  }

  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('visible'));
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('visible');
    modal.hidden = true;
  }

  function categoryMap() {
    return new Map(state.categories.map((item) => [item.id, item]));
  }

  function categoryPath(category) {
    const map = categoryMap();
    const names = [category.name];
    const visited = new Set([category.id]);
    let parentId = category.parent_id;
    while (parentId && !visited.has(parentId) && names.length < 20) {
      visited.add(parentId);
      const parent = map.get(parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parent_id;
    }
    return names;
  }

  function isDescendant(candidateId, ancestorId) {
    const map = categoryMap();
    const visited = new Set();
    let cursor = map.get(candidateId);
    while (cursor?.parent_id && !visited.has(cursor.id)) {
      if (cursor.parent_id === ancestorId) return true;
      visited.add(cursor.id);
      cursor = map.get(cursor.parent_id);
    }
    return false;
  }

  function appendText(parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function statusBadge(active) {
    const badge = document.createElement('span');
    badge.className = `shop-status-badge ${active ? 'active' : 'inactive'}`;
    badge.appendChild(document.createElement('i'));
    appendText(badge, 'span', '', active ? 'Activa' : 'Inactiva');
    return badge;
  }

  function actionButton(label, type, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `shop-table-action ${type}`;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = type === 'delete'
      ? '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
    button.addEventListener('click', handler);
    return button;
  }

  function renderCategories() {
    byId('shop-category-count').textContent = String(state.categories.length);
    categoryBody.replaceChildren();
    if (!state.categories.length) {
      categoryShell.hidden = true;
      categoryState.hidden = false;
      categoryState.textContent = 'Nu exista categorii. Apasa butonul + pentru prima categorie.';
      categoryState.className = 'shop-catalog-state empty';
      return;
    }

    state.categories.forEach((category) => {
      const path = categoryPath(category);
      const row = document.createElement('tr');
      const imageCell = document.createElement('td');
      if (category.thumbnail_url) {
        const image = document.createElement('img');
        image.className = 'shop-table-thumb';
        image.src = category.thumbnail_url;
        image.alt = '';
        imageCell.appendChild(image);
      } else {
        const fallback = document.createElement('span');
        fallback.className = 'shop-table-thumb empty';
        fallback.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
        imageCell.appendChild(fallback);
      }
      row.appendChild(imageCell);

      const nameCell = document.createElement('td');
      const nameWrap = document.createElement('span');
      nameWrap.className = 'shop-table-name';
      nameWrap.style.setProperty('--shop-depth', String(Math.max(0, path.length - 1)));
      appendText(nameWrap, 'strong', '', category.name);
      appendText(nameWrap, 'small', '', `/${category.slug}`);
      if (category.description) appendText(nameWrap, 'em', '', category.description);
      nameCell.appendChild(nameWrap);
      row.appendChild(nameCell);

      const parentCell = document.createElement('td');
      appendText(parentCell, 'span', category.parent_name ? 'shop-parent-path' : 'shop-parent-root', category.parent_name ? path.slice(0, -1).join(' › ') : 'Categorie principala');
      if (path.length > 1) appendText(parentCell, 'small', 'shop-level-label', `Nivel ${path.length}`);
      row.appendChild(parentCell);

      const statusCell = document.createElement('td');
      statusCell.appendChild(statusBadge(Boolean(category.is_active)));
      row.appendChild(statusCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'shop-table-actions';
      actionsCell.append(actionButton('Editeaza categoria', 'edit', () => openCategory(category)), actionButton('Sterge categoria', 'delete', () => requestDelete('category', category)));
      row.appendChild(actionsCell);
      categoryBody.appendChild(row);
    });
    categoryState.hidden = true;
    categoryShell.hidden = false;
  }

  function renderBrands() {
    byId('shop-brand-count').textContent = String(state.brands.length);
    brandBody.replaceChildren();
    if (!state.brands.length) {
      brandShell.hidden = true;
      brandState.hidden = false;
      brandState.textContent = 'Nu exista compatibilitati. Apasa butonul + pentru prima compatibilitate.';
      brandState.className = 'shop-catalog-state empty';
      return;
    }
    state.brands.forEach((brand) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const wrap = document.createElement('span');
      wrap.className = 'shop-table-name';
      appendText(wrap, 'strong', '', brand.name);
      appendText(wrap, 'small', '', `/${brand.slug}`);
      nameCell.appendChild(wrap);
      row.appendChild(nameCell);
      appendText(row, 'td', brand.website_url ? 'shop-website' : 'shop-parent-root', brand.website_url || '—');
      const statusCell = document.createElement('td');
      statusCell.appendChild(statusBadge(Boolean(brand.is_active)));
      row.appendChild(statusCell);
      const actionsCell = document.createElement('td');
      actionsCell.className = 'shop-table-actions';
      actionsCell.append(actionButton('Editeaza compatibilitatea', 'edit', () => openBrand(brand)), actionButton('Sterge compatibilitatea', 'delete', () => requestDelete('brand', brand)));
      row.appendChild(actionsCell);
      brandBody.appendChild(row);
    });
    brandState.hidden = true;
    brandShell.hidden = false;
  }

  function renderManufacturers() {
    byId('shop-manufacturer-count').textContent = String(state.manufacturers.length);
    manufacturerBody.replaceChildren();
    if (!state.manufacturers.length) {
      manufacturerShell.hidden = true;
      manufacturerState.hidden = false;
      manufacturerState.textContent = 'Nu exista producatori. Apasa butonul + pentru primul producator.';
      manufacturerState.className = 'shop-catalog-state empty';
      return;
    }
    state.manufacturers.forEach((manufacturer) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const wrap = document.createElement('span');
      wrap.className = 'shop-table-name';
      appendText(wrap, 'strong', '', manufacturer.name);
      appendText(wrap, 'small', '', `/${manufacturer.slug}`);
      nameCell.appendChild(wrap);
      row.appendChild(nameCell);
      appendText(row, 'td', manufacturer.website_url ? 'shop-website' : 'shop-parent-root', manufacturer.website_url || '—');
      const statusCell = document.createElement('td');
      statusCell.appendChild(statusBadge(Boolean(manufacturer.is_active)));
      row.appendChild(statusCell);
      const actionsCell = document.createElement('td');
      actionsCell.className = 'shop-table-actions';
      actionsCell.append(actionButton('Editeaza producatorul', 'edit', () => openManufacturer(manufacturer)), actionButton('Sterge producatorul', 'delete', () => requestDelete('manufacturer', manufacturer)));
      row.appendChild(actionsCell);
      manufacturerBody.appendChild(row);
    });
    manufacturerState.hidden = true;
    manufacturerShell.hidden = false;
  }

  async function loadCatalog(silent = false) {
    if (state.loading) return;
    state.loading = true;
    if (!silent) {
      categoryState.hidden = false;
      brandState.hidden = false;
      manufacturerState.hidden = false;
      categoryState.className = brandState.className = manufacturerState.className = 'shop-catalog-state loading';
      categoryState.textContent = 'Se incarca categoriile...';
      brandState.textContent = 'Se incarca compatibilitatile...';
      manufacturerState.textContent = 'Se incarca producatorii...';
    }
    try {
      const [categories, brands, manufacturers] = await Promise.all([window.SHOP_API.listCategories(), window.SHOP_API.listBrands(), window.SHOP_API.listManufacturers()]);
      state.categories = Array.isArray(categories) ? categories : [];
      state.brands = Array.isArray(brands) ? brands : [];
      state.manufacturers = Array.isArray(manufacturers) ? manufacturers : [];
      state.loaded = true;
      renderCategories();
      renderBrands();
      renderManufacturers();
    } catch (error) {
      categoryShell.hidden = true;
      brandShell.hidden = true;
      manufacturerShell.hidden = true;
      [categoryState, brandState, manufacturerState].forEach((element) => {
        element.hidden = false;
        element.className = 'shop-catalog-state error';
        element.textContent = error.message || 'Catalogul SHOP nu a putut fi incarcat.';
      });
      toast(error.message || 'Catalogul SHOP nu a putut fi incarcat.', 'error');
    } finally {
      state.loading = false;
    }
  }

  function updateCategoryPreview(url) {
    const preview = byId('shop-category-image-preview');
    preview.style.backgroundImage = url ? `url("${String(url).replace(/"/g, '%22')}")` : '';
    preview.classList.toggle('has-image', Boolean(url));
  }

  function populateParentOptions(selectedId = '') {
    const select = byId('shop-category-parent');
    select.replaceChildren(new Option('Fara parinte — categorie principala', ''));
    state.categories.forEach((category) => {
      if (category.id === state.editingCategory?.id) return;
      if (state.editingCategory && isDescendant(category.id, state.editingCategory.id)) return;
      const path = categoryPath(category);
      const option = new Option(`${'— '.repeat(Math.max(0, path.length - 1))}${path.join(' › ')}`, category.id);
      select.appendChild(option);
    });
    select.value = selectedId || '';
  }

  function openCategory(category = null) {
    state.editingCategory = category;
    state.imageBase64 = null;
    state.imageRemoved = false;
    byId('shop-category-modal-title').textContent = category ? 'Editeaza categoria' : 'Categorie noua';
    byId('shop-category-name').value = category?.name || '';
    byId('shop-category-description').value = category?.description || '';
    byId('shop-category-active').checked = category?.is_active ?? true;
    populateParentOptions(category?.parent_id || '');
    updateCategoryPreview(category?.thumbnail_url || '');
    byId('shop-category-image-remove').hidden = !category?.thumbnail_url;
    byId('shop-category-image-input').value = '';
    openModal(categoryModal);
    setTimeout(() => byId('shop-category-name').focus(), 80);
  }

  function openBrand(brand = null) {
    state.editingBrand = brand;
    byId('shop-brand-modal-title').textContent = brand ? 'Editeaza compatibilitatea' : 'Compatibilitate noua';
    byId('shop-brand-name').value = brand?.name || '';
    byId('shop-brand-website').value = brand?.website_url || '';
    byId('shop-brand-active').checked = brand?.is_active ?? true;
    openModal(brandModal);
    setTimeout(() => byId('shop-brand-name').focus(), 80);
  }

  function openManufacturer(manufacturer = null) {
    state.editingManufacturer = manufacturer;
    byId('shop-manufacturer-modal-title').textContent = manufacturer ? 'Editeaza producatorul' : 'Producator nou';
    byId('shop-manufacturer-name').value = manufacturer?.name || '';
    byId('shop-manufacturer-website').value = manufacturer?.website_url || '';
    byId('shop-manufacturer-active').checked = manufacturer?.is_active ?? true;
    openModal(manufacturerModal);
    setTimeout(() => byId('shop-manufacturer-name').focus(), 80);
  }

  function requestDelete(type, item) {
    state.deleteTarget = { type, item };
    byId('shop-delete-title').textContent = type === 'category' ? 'Stergi categoria?' : type === 'brand' ? 'Stergi compatibilitatea?' : 'Stergi producatorul?';
    byId('shop-delete-message').textContent = type === 'category'
      ? `„${item.name}” va fi stearsa definitiv. Subcategoriile sale vor ramane fara parinte.`
      : `„${item.name}” va fi sters definitiv.`;
    openModal(deleteModal);
  }

  byId('shop-category-add')?.addEventListener('click', () => openCategory());
  byId('shop-brand-add')?.addEventListener('click', () => openBrand());
  byId('shop-manufacturer-add')?.addEventListener('click', () => openManufacturer());
  document.querySelectorAll('[data-shop-refresh]').forEach((button) => button.addEventListener('click', () => loadCatalog()));
  document.querySelectorAll('[data-shop-modal-close]').forEach((button) => button.addEventListener('click', () => {
    const modal = byId(button.dataset.shopModalClose);
    closeModal(modal);
    if (modal === deleteModal) state.deleteTarget = null;
  }));
  document.querySelectorAll('.shop-modal-overlay').forEach((overlay) => overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) closeModal(overlay);
  }));

  byId('shop-category-image-preview')?.addEventListener('click', () => byId('shop-category-image-input').click());
  byId('shop-category-image-choose')?.addEventListener('click', () => byId('shop-category-image-input').click());
  byId('shop-category-image-remove')?.addEventListener('click', () => {
    state.imageBase64 = null;
    state.imageRemoved = true;
    updateCategoryPreview('');
    byId('shop-category-image-remove').hidden = true;
  });
  byId('shop-category-image-input')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('Foloseste o imagine JPG, PNG sau WEBP.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('Miniatura poate avea maximum 5 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.imageBase64 = String(reader.result || '');
      state.imageRemoved = false;
      updateCategoryPreview(state.imageBase64);
      byId('shop-category-image-remove').hidden = false;
    };
    reader.readAsDataURL(file);
  });

  byId('shop-category-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveButton = byId('shop-category-save');
    const payload = {
      name: byId('shop-category-name').value.trim(),
      description: byId('shop-category-description').value.trim(),
      parent_id: byId('shop-category-parent').value || null,
      is_active: byId('shop-category-active').checked,
      ...(state.imageBase64 ? { thumbnail_base64: state.imageBase64 } : {}),
      ...(state.imageRemoved ? { thumbnail_remove: true } : {}),
    };
    setBusy(saveButton, true, 'Se salveaza...');
    try {
      if (state.editingCategory) await window.SHOP_API.updateCategory(state.editingCategory.id, payload);
      else await window.SHOP_API.createCategory(payload);
      closeModal(categoryModal);
      toast(state.editingCategory ? 'Categoria a fost actualizata.' : 'Categoria a fost adaugata.');
      await loadCatalog(true);
    } catch (error) {
      toast(error.message || 'Categoria nu a putut fi salvata.', 'error');
    } finally {
      setBusy(saveButton, false, '');
    }
  });

  byId('shop-brand-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveButton = byId('shop-brand-save');
    const payload = { name: byId('shop-brand-name').value.trim(), website_url: byId('shop-brand-website').value.trim(), is_active: byId('shop-brand-active').checked };
    setBusy(saveButton, true, 'Se salveaza...');
    try {
      if (state.editingBrand) await window.SHOP_API.updateBrand(state.editingBrand.id, payload);
      else await window.SHOP_API.createBrand(payload);
      closeModal(brandModal);
      toast(state.editingBrand ? 'Compatibilitatea a fost actualizata.' : 'Compatibilitatea a fost adaugata.');
      await loadCatalog(true);
    } catch (error) {
      toast(error.message || 'Compatibilitatea nu a putut fi salvata.', 'error');
    } finally {
      setBusy(saveButton, false, '');
    }
  });

  byId('shop-manufacturer-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveButton = byId('shop-manufacturer-save');
    const payload = { name: byId('shop-manufacturer-name').value.trim(), website_url: byId('shop-manufacturer-website').value.trim(), is_active: byId('shop-manufacturer-active').checked };
    setBusy(saveButton, true, 'Se salveaza...');
    try {
      if (state.editingManufacturer) await window.SHOP_API.updateManufacturer(state.editingManufacturer.id, payload);
      else await window.SHOP_API.createManufacturer(payload);
      closeModal(manufacturerModal);
      toast(state.editingManufacturer ? 'Producatorul a fost actualizat.' : 'Producatorul a fost adaugat.');
      await loadCatalog(true);
    } catch (error) {
      toast(error.message || 'Producatorul nu a putut fi salvat.', 'error');
    } finally {
      setBusy(saveButton, false, '');
    }
  });

  byId('shop-delete-confirm')?.addEventListener('click', async () => {
    if (!state.deleteTarget) return;
    const button = byId('shop-delete-confirm');
    setBusy(button, true, 'Se sterge...');
    try {
      if (state.deleteTarget.type === 'category') await window.SHOP_API.deleteCategory(state.deleteTarget.item.id);
      else if (state.deleteTarget.type === 'brand') await window.SHOP_API.deleteBrand(state.deleteTarget.item.id);
      else await window.SHOP_API.deleteManufacturer(state.deleteTarget.item.id);
      closeModal(deleteModal);
      toast(state.deleteTarget.type === 'category' ? 'Categoria a fost stearsa.' : state.deleteTarget.type === 'brand' ? 'Compatibilitatea a fost stearsa.' : 'Producatorul a fost sters.');
      state.deleteTarget = null;
      await loadCatalog(true);
    } catch (error) {
      toast(error.message || 'Elementul nu a putut fi sters.', 'error');
    } finally {
      setBusy(button, false, '');
    }
  });

  window.addEventListener('tab-change', (event) => {
    if (event.detail === 'shop-categories' || event.detail === 'shop-brands' || event.detail === 'shop-manufacturers') loadCatalog(state.loaded);
  });
  window.SHOP_CATALOG = { load: loadCatalog, openCategory, openBrand, openManufacturer };
})();
