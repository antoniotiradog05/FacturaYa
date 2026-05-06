const API_URL = '';

const state = {
    currentPage: 'dashboard',
    clients: [],
    invoices: [],
    stats: null,
    loading: false,
    newInvoice: createInitialInvoiceState()
};

function createInitialInvoiceState() {
    return {
        number: '',
        client_name: '',
        date: new Date().toISOString().split('T')[0],
        due_date: '',
        vat_rate: 21,
        irpf_rate: 15,
        items: [{ description: '', quantity: 1, unit_price: 0 }]
    };
}

const asNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const formatMoney = (value) => `${asNumber(value, 0).toFixed(2)} €`;

function generateNextInvoiceNumber() {
    const year = new Date().getFullYear();
    const prefix = `FAC-${year}-`;
    const maxSeq = state.invoices.reduce((acc, inv) => {
        if (!String(inv.number || '').startsWith(prefix)) return acc;
        const seq = asNumber(String(inv.number).slice(prefix.length), 0);
        return Math.max(acc, seq);
    }, 0);
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

async function requestJSON(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, options);
    let payload = null;
    try {
        payload = await response.json();
    } catch (error) {
        payload = null;
    }
    if (!response.ok) {
        const message = payload?.error || 'Error en la solicitud.';
        throw new Error(message);
    }
    return payload;
}

async function downloadInvoicePdf(invoiceId, invoiceNumber) {
    const response = await fetch(`${API_URL}/api/invoices/${invoiceId}/pdf`, {
        method: 'GET'
    });

    if (!response.ok) {
        let message = 'No se pudo descargar el PDF.';
        try {
            const errorData = await response.json();
            if (errorData && errorData.error) {
                message = errorData.error;
            }
        } catch (error) {
            // ignore non-JSON errors
        }
        throw new Error(message);
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `Factura-${invoiceNumber || invoiceId}-${stamp}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
}

document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

async function navigateTo(page) {
    if (state.loading) return;
    if (state.currentPage === page && state.stats) return;

    const pageContent = document.getElementById('page-content');
    if (pageContent.children.length > 0) {
        await gsap.to('#page-content', { opacity: 0, y: -16, duration: 0.22, ease: 'power2.in' });
    }

    state.currentPage = page;
    document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });

    const titles = {
        dashboard: 'Vista General',
        'new-invoice': 'Crear Factura',
        invoices: 'Gestión de Facturas',
        clients: 'Mis Clientes'
    };
    document.getElementById('page-title').innerText = titles[page] || 'FacturaYa';

    await renderPage();
    gsap.fromTo('#page-content', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
}

async function fetchData() {
    state.loading = true;
    try {
        const [clients, invoices, stats] = await Promise.all([
            requestJSON('/api/clients'),
            requestJSON('/api/invoices'),
            requestJSON('/api/stats')
        ]);
        state.clients = clients;
        state.invoices = invoices;
        state.stats = stats;
        if (!state.newInvoice.number) {
            state.newInvoice.number = generateNextInvoiceNumber();
        }
    } finally {
        state.loading = false;
    }
}

async function renderPage() {
    const container = document.getElementById('page-content');
    try {
        await fetchData();
    } catch (error) {
        container.innerHTML = `<div class="form-card"><p>Error cargando datos: ${error.message}</p></div>`;
        showNotification(error.message, 'danger');
        return;
    }

    switch (state.currentPage) {
        case 'dashboard':
            renderDashboard(container);
            break;
        case 'new-invoice':
            renderNewInvoice(container);
            break;
        case 'invoices':
            renderInvoices(container);
            break;
        case 'clients':
            renderClients(container);
            break;
        default:
            renderDashboard(container);
    }

    if (window.lucide) window.lucide.createIcons();
}

function renderDashboard(container) {
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card accent">
                <h3>Total Facturado</h3>
                <div class="value">${formatMoney(state.stats.totalBilled)}</div>
            </div>
            <div class="stat-card warning">
                <h3>Pendiente</h3>
                <div class="value">${formatMoney(state.stats.totalPending)}</div>
            </div>
            <div class="stat-card info">
                <h3>Facturas</h3>
                <div class="value">${state.stats.invoiceCount}</div>
            </div>
            <div class="stat-card success">
                <h3>Clientes</h3>
                <div class="value">${state.stats.clientCount}</div>
            </div>
        </div>
        <div class="data-section">
            <div class="section-header">
                <h3>Actividad Reciente</h3>
            </div>
            <div class="table-card">
                <table>
                    <thead>
                        <tr>
                            <th>Referencia</th>
                            <th>Cliente</th>
                            <th>Fecha</th>
                            <th>Total</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.invoices.slice(0, 5).map((inv) => `
                            <tr>
                                <td class="font-mono font-bold">${inv.number}</td>
                                <td>${inv.client_name}</td>
                                <td>${inv.date}</td>
                                <td class="font-mono font-bold">${formatMoney(inv.total)}</td>
                                <td><span class="status-badge ${String(inv.status || '').toLowerCase()}">${inv.status}</span></td>
                            </tr>
                        `).join('') || '<tr><td colspan="5">No hay actividad</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderNewInvoice(container) {
    container.innerHTML = `
        <div class="editor-layout">
            <div class="editor-main">
                <div class="form-card">
                    <div class="form-header">
                        <h3>Información del Documento</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Nº Factura</label>
                            <input type="text" id="inv-number" value="${state.newInvoice.number}" class="premium-input">
                        </div>
                        <div class="form-group">
                            <label>Cliente Receptor</label>
                            <input type="text" id="inv-client" list="client-list" value="${state.newInvoice.client_name || ''}" class="premium-input" placeholder="Nombre del cliente...">
                            <datalist id="client-list">
                                ${state.clients.map((c) => `<option value="${c.name}">`).join('')}
                            </datalist>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Fecha Emisión</label>
                            <input type="date" id="inv-date" value="${state.newInvoice.date}" class="premium-input">
                        </div>
                        <div class="form-group">
                            <label>Vencimiento</label>
                            <input type="date" id="inv-due-date" value="${state.newInvoice.due_date || ''}" class="premium-input">
                        </div>
                    </div>

                    <div class="items-section" style="margin-top: 1.5rem;">
                        <div class="section-header" style="margin-bottom: 0.8rem;">
                            <h3>Conceptos</h3>
                            <button class="btn btn-ghost" id="add-item">
                                <i data-lucide="plus"></i> Añadir
                            </button>
                        </div>
                        <div class="table-card">
                            <table id="items-table">
                                <thead>
                                    <tr>
                                        <th style="width: 50%">Descripción</th>
                                        <th style="text-align: center">Uds.</th>
                                        <th style="text-align: right">P. Unitario</th>
                                        <th style="text-align: right">Total</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody id="items-body">
                                    ${state.newInvoice.items.map((item, index) => `
                                        <tr>
                                            <td><input type="text" class="item-desc" data-index="${index}" value="${item.description}" placeholder="Ej: Desarrollo Frontend..." style="background:transparent;border:none;color:white;width:100%"></td>
                                            <td style="text-align: center"><input type="number" class="item-qty" data-index="${index}" value="${item.quantity}" min="1" step="1" style="background:transparent;border:none;color:white;width:60px;text-align:center"></td>
                                            <td style="text-align: right"><input type="number" class="item-price" data-index="${index}" value="${item.unit_price}" min="0" step="0.01" style="background:transparent;border:none;color:white;width:100px;text-align:right"></td>
                                            <td style="text-align: right" class="item-total-cell font-mono font-bold">${formatMoney(item.quantity * item.unit_price)}</td>
                                            <td style="text-align: center"><button class="btn-icon-delete remove-item" data-index="${index}"><i data-lucide="trash-2"></i></button></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            <div class="editor-sidebar">
                <div class="summary-card">
                    <h3>Resumen</h3>
                    <div id="totals-box"></div>
                    <div class="tax-settings">
                        <div class="tax-field">
                            <label>IVA (%)</label>
                            <input type="number" id="vat-rate" value="${state.newInvoice.vat_rate}" min="0" step="0.01" class="premium-input sm-input">
                        </div>
                        <div class="tax-field">
                            <label>IRPF (%)</label>
                            <input type="number" id="irpf-rate" value="${state.newInvoice.irpf_rate}" min="0" step="0.01" class="premium-input sm-input">
                        </div>
                    </div>
                    <div class="editor-actions">
                        <button class="btn btn-primary btn-block" id="save-invoice">
                            <i data-lucide="zap"></i> Generar Factura
                        </button>
                        <button class="btn btn-ghost btn-block" id="clear-invoice">
                            <i data-lucide="refresh-ccw"></i> Limpiar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    setupInvoiceFormListeners();
    updateTotals();
}

function renderInvoices(container) {
    container.innerHTML = `
        <div class="data-section">
            <div class="table-card">
                <table>
                    <thead>
                        <tr>
                            <th>Referencia</th>
                            <th>Cliente</th>
                            <th>Fecha</th>
                            <th>Total</th>
                            <th>Estado</th>
                            <th style="text-align: right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.invoices.map((inv) => `
                            <tr>
                                <td class="font-mono font-bold">${inv.number}</td>
                                <td>${inv.client_name}</td>
                                <td>${inv.date}</td>
                                <td class="font-mono font-bold">${formatMoney(inv.total)}</td>
                                <td><span class="status-badge ${String(inv.status || '').toLowerCase()}">${inv.status}</span></td>
                                <td style="text-align: right; display: flex; gap: 0.5rem; justify-content: flex-end;">
                                    <button class="btn btn-ghost btn-sm download-pdf" data-id="${inv.id}">
                                        <i data-lucide="download"></i> PDF
                                    </button>
                                    <button class="btn btn-ghost btn-sm delete-invoice" data-id="${inv.id}" data-number="${inv.number}" style="color: var(--hot)">
                                        <i data-lucide="trash-2"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('') || '<tr><td colspan="6">No hay facturas</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.querySelectorAll('.download-pdf').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const invoice = state.invoices.find((item) => String(item.id) === String(btn.dataset.id));
            try {
                await downloadInvoicePdf(btn.dataset.id, invoice?.number);
                showNotification('PDF descargado');
            } catch (error) {
                showNotification(error.message, 'danger');
            }
        });
    });

    document.querySelectorAll('.delete-invoice').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const invoiceId = String(btn.dataset.id || '').trim();
            const invoiceNumber = String(btn.dataset.number || invoiceId);

            if (!invoiceId) {
                showNotification('No se encontro la factura a eliminar.', 'danger');
                return;
            }
            if (!confirm(`¿Eliminar la factura ${invoiceNumber}?`)) return;

            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2"></i>';
            if (window.lucide) window.lucide.createIcons();

            try {
                await requestJSON(`/api/invoices/${invoiceId}`, { method: 'DELETE' });
                showNotification('Factura eliminada');
                await renderPage();
            } catch (error) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
                if (window.lucide) window.lucide.createIcons();
                showNotification(`No se pudo borrar: ${error.message}`, 'danger');
            }
        });
    });
}

function renderClients(container) {
    container.innerHTML = `
        <div class="editor-layout">
            <div class="editor-main">
                <div class="form-card" style="margin-bottom: 1.1rem;">
                    <div class="form-header">
                        <h3>Nuevo Cliente</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Nombre / Empresa</label>
                            <input type="text" id="client-name" class="premium-input">
                        </div>
                        <div class="form-group">
                            <label>NIF / CIF</label>
                            <input type="text" id="client-tax" class="premium-input">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="client-email" class="premium-input">
                        </div>
                        <div class="form-group">
                            <label>Dirección</label>
                            <input type="text" id="client-address" class="premium-input">
                        </div>
                    </div>
                    <button class="btn btn-primary" id="save-client">
                        <i data-lucide="save"></i> Guardar Cliente
                    </button>
                </div>
                <div class="table-card">
                    <table>
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>CIF</th>
                                <th>Email</th>
                                <th style="text-align: right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${state.clients.map((c) => `
                                <tr>
                                    <td class="font-bold">${c.name}</td>
                                    <td class="font-mono">${c.tax_id || '-'}</td>
                                    <td>${c.email || '-'}</td>
                                    <td style="text-align: right">
                                        <button class="btn btn-ghost btn-sm delete-client" data-id="${c.id}" style="color: var(--hot)">
                                            <i data-lucide="trash-2"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="4">No hay clientes</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.getElementById('save-client').addEventListener('click', async () => {
        const client = {
            name: document.getElementById('client-name').value.trim(),
            tax_id: document.getElementById('client-tax').value.trim(),
            email: document.getElementById('client-email').value.trim(),
            address: document.getElementById('client-address').value.trim()
        };
        if (!client.name) {
            showNotification('Nombre requerido', 'danger');
            return;
        }

        try {
            await requestJSON('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(client)
            });
            showNotification('Cliente registrado');
            await renderPage();
        } catch (error) {
            showNotification(error.message, 'danger');
        }
    });

    document.querySelectorAll('.delete-client').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!confirm('¿Eliminar cliente?')) return;
            try {
                await requestJSON(`/api/clients/${btn.dataset.id}`, { method: 'DELETE' });
                showNotification('Cliente eliminado');
                await renderPage();
            } catch (error) {
                showNotification(error.message, 'danger');
            }
        });
    });
}

function getCleanInvoiceItems() {
    return state.newInvoice.items
        .map((item) => ({
            description: String(item.description || '').trim(),
            quantity: asNumber(item.quantity, 0),
            unit_price: asNumber(item.unit_price, 0)
        }))
        .filter((item) => item.description || item.quantity > 0 || item.unit_price > 0);
}

function validateInvoicePayload(payload) {
    if (!payload.number) return 'El numero de factura es obligatorio.';
    if (!payload.client_name) return 'Nombre del cliente requerido.';
    if (!payload.date) return 'Fecha de emision obligatoria.';
    if (!Array.isArray(payload.items) || payload.items.length === 0) return 'Debes agregar al menos un concepto.';
    const hasInvalidItem = payload.items.some((item) => !item.description || item.quantity <= 0 || item.unit_price < 0);
    if (hasInvalidItem) return 'Todos los conceptos deben tener descripcion, cantidad > 0 y precio >= 0.';
    return null;
}

function setupInvoiceFormListeners() {
    const container = document.getElementById('page-content');
    const itemsBody = document.getElementById('items-body');

    document.getElementById('add-item').addEventListener('click', () => {
        state.newInvoice.items.push({ description: '', quantity: 1, unit_price: 0 });
        renderNewInvoice(container);
    });

    itemsBody.addEventListener('input', (e) => {
        const index = Number(e.target.dataset.index);
        if (!Number.isInteger(index) || !state.newInvoice.items[index]) return;

        if (e.target.classList.contains('item-desc')) {
            state.newInvoice.items[index].description = e.target.value;
        }
        if (e.target.classList.contains('item-qty')) {
            state.newInvoice.items[index].quantity = Math.max(0, asNumber(e.target.value, 0));
        }
        if (e.target.classList.contains('item-price')) {
            state.newInvoice.items[index].unit_price = Math.max(0, asNumber(e.target.value, 0));
        }
        updateTotals();
    });

    document.getElementById('vat-rate').addEventListener('input', (e) => {
        state.newInvoice.vat_rate = Math.max(0, asNumber(e.target.value, 0));
        updateTotals();
    });

    document.getElementById('irpf-rate').addEventListener('input', (e) => {
        state.newInvoice.irpf_rate = Math.max(0, asNumber(e.target.value, 0));
        updateTotals();
    });

    document.querySelectorAll('.remove-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (state.newInvoice.items.length === 1) {
                showNotification('Debe existir al menos un concepto.', 'danger');
                return;
            }
            state.newInvoice.items.splice(Number(btn.dataset.index), 1);
            renderNewInvoice(container);
        });
    });

    document.getElementById('save-invoice').addEventListener('click', async () => {
        const payload = {
            number: document.getElementById('inv-number').value.trim(),
            client_name: document.getElementById('inv-client').value.trim(),
            date: document.getElementById('inv-date').value,
            due_date: document.getElementById('inv-due-date').value,
            vat_rate: state.newInvoice.vat_rate,
            irpf_rate: state.newInvoice.irpf_rate,
            items: getCleanInvoiceItems(),
            status: 'PENDING'
        };

        const validationError = validateInvoicePayload(payload);
        if (validationError) {
            showNotification(validationError, 'danger');
            return;
        }

        try {
            await requestJSON('/api/invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            state.newInvoice = createInitialInvoiceState();
            showNotification('Factura creada');
            await navigateTo('invoices');
        } catch (error) {
            showNotification(error.message, 'danger');
        }
    });

    document.getElementById('clear-invoice').addEventListener('click', () => {
        if (!confirm('¿Vaciar formulario?')) return;
        state.newInvoice = createInitialInvoiceState();
        state.newInvoice.number = generateNextInvoiceNumber();
        renderNewInvoice(container);
    });
}

function updateTotals() {
    const subtotal = state.newInvoice.items.reduce(
        (acc, item) => acc + (Math.max(0, asNumber(item.quantity, 0)) * Math.max(0, asNumber(item.unit_price, 0))),
        0
    );
    const vat = subtotal * (Math.max(0, asNumber(state.newInvoice.vat_rate, 0)) / 100);
    const irpf = subtotal * (Math.max(0, asNumber(state.newInvoice.irpf_rate, 0)) / 100);
    const total = subtotal + vat - irpf;

    const box = document.getElementById('totals-box');
    if (box) {
        box.innerHTML = `
            <div class="summary-row"><span>Base Imponible</span><span>${formatMoney(subtotal)}</span></div>
            <div class="summary-row"><span>IVA (${state.newInvoice.vat_rate}%)</span><span>${formatMoney(vat)}</span></div>
            <div class="summary-row"><span>IRPF (-${state.newInvoice.irpf_rate}%)</span><span style="color:var(--hot)">-${formatMoney(irpf)}</span></div>
            <div class="summary-total-container">
                <div class="total-label">Total a Pagar</div>
                <div class="total-value">${formatMoney(total)}</div>
            </div>
        `;
    }

    document.querySelectorAll('.item-total-cell').forEach((el, i) => {
        const item = state.newInvoice.items[i];
        if (!item) return;
        el.innerText = formatMoney(asNumber(item.quantity, 0) * asNumber(item.unit_price, 0));
    });
}

function showNotification(msg, type = 'success') {
    const container = document.getElementById('notifications');
    const note = document.createElement('div');
    note.className = 'notification';
    note.style.background = type === 'success' ? 'var(--acid)' : 'var(--hot)';
    note.innerHTML = `<i data-lucide="${type === 'success' ? 'check' : 'alert-circle'}"></i> <span>${msg}</span>`;
    container.appendChild(note);
    if (window.lucide) window.lucide.createIcons();

    gsap.from(note, { x: 80, opacity: 0, duration: 0.35, ease: 'power2.out' });
    setTimeout(() => {
        gsap.to(note, { x: 80, opacity: 0, duration: 0.28, onComplete: () => note.remove() });
    }, 2600);
}

navigateTo('dashboard');
