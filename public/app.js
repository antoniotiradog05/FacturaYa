const API_URL = '';

const state = {
    currentPage: 'dashboard',
    clients: [],
    invoices: [],
    stats: null,
    settings: null,
    cashFlow: [],
    loading: false,
    newInvoice: null,
    isEditing: false,
    editingInvoiceId: null
};

state.newInvoice = createInitialInvoiceState();

function createInitialInvoiceState() {
    const vat = (typeof state !== 'undefined' && state.settings) ? state.settings.default_vat_rate : 21;
    const irpf = (typeof state !== 'undefined' && state.settings) ? state.settings.default_irpf_rate : 15;

    return {
        number: '',
        client_name: '',
        date: new Date().toISOString().split('T')[0],
        due_date: '',
        discount_rate: 0,
        vat_rate: vat,
        irpf_rate: irpf,
        notes: '',
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
    // Default to custom prefix from settings, fallback to standard if not available
    const prefix = state.settings?.invoice_prefix || `FAC-${year}-`;
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

async function editInvoice(id) {
    state.loading = true;
    try {
        const inv = await requestJSON(`/api/invoices/${id}`);
        state.isEditing = true;
        state.editingInvoiceId = id;
        state.newInvoice = {
            number: inv.number,
            client_name: inv.client_name,
            date: inv.date,
            due_date: inv.due_date || '',
            discount_rate: inv.discount_rate || 0,
            vat_rate: inv.vat_rate,
            irpf_rate: inv.irpf_rate,
            notes: inv.notes || '',
            items: inv.items.map(it => ({
                description: it.description,
                quantity: it.quantity,
                unit_price: it.unit_price
            }))
        };
        await navigateTo('new-invoice');
    } catch (error) {
        showNotification(error.message, 'danger');
    } finally {
        state.loading = false;
    }
}

document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

async function navigateTo(page) {
    if (state.loading) return;
    if (state.currentPage === page && state.stats && page !== 'new-invoice') return;

    state.loading = true;
    const content = document.getElementById('page-content');
    
    // Smooth Out: Blur + Fade
    await gsap.to(content, { 
        opacity: 0, 
        filter: 'blur(10px)', 
        scale: 0.98,
        duration: 0.3, 
        ease: 'power2.inOut' 
    });

    state.currentPage = page;
    
    if (page !== 'new-invoice') {
        state.isEditing = false;
        state.editingInvoiceId = null;
    }

    document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });

    const titles = {
        dashboard: 'Vista General',
        'new-invoice': state.isEditing ? 'Editar Factura' : 'Crear Factura',
        invoices: 'Gestión de Facturas',
        clients: 'Mis Clientes',
        calculator: 'Centro de Impuestos',
        settings: 'Configuración'
    };
    document.getElementById('page-title').innerText = titles[page] || 'FacturaYa';

    await renderPage();
    
    // Smooth In: Reveal with a slight spring
    gsap.fromTo(content, 
        { opacity: 0, filter: 'blur(10px)', scale: 1.02 }, 
        { opacity: 1, filter: 'blur(0px)', scale: 1, duration: 0.5, ease: 'back.out(1.2)' }
    );
    
    state.loading = false;
}

async function fetchData() {
    state.loading = true;
    try {
        const [clients, invoices, stats, settings, chartData, cashFlow] = await Promise.all([
            requestJSON('/api/clients'),
            requestJSON('/api/invoices'),
            requestJSON('/api/stats'),
            requestJSON('/api/settings'),
            requestJSON('/api/stats/chart'),
            requestJSON('/api/cash-flow')
        ]);
        state.clients = clients;
        state.invoices = invoices;
        state.stats = stats;
        state.settings = settings;
        state.chartData = chartData;
        state.cashFlow = cashFlow;

        updateSidebarWidget();

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
        case 'calculator':
            renderCalculator(container);
            break;
        case 'clients':
            renderClients(container);
            break;
        case 'settings':
            renderSettings(container);
            break;
        default:
            renderDashboard(container);
    }

    if (window.lucide) window.lucide.createIcons();
}

function renderDashboard(container) {
    const netProfit = (state.stats.totalBilled || 0) - (state.stats.totalExpenses || 0);
    
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card accent tilt-card">
                <div class="glare"></div>
                <h3>Total Facturado</h3>
                <div class="value">${formatMoney(state.stats.totalBilled)}</div>
            </div>
            <div class="stat-card warning tilt-card">
                <div class="glare"></div>
                <h3>Pendiente Cobro</h3>
                <div class="value">${formatMoney(state.stats.totalPending)}</div>
            </div>
            <div class="stat-card hot tilt-card">
                <div class="glare"></div>
                <h3>Gastos Totales</h3>
                <div class="value">${formatMoney(state.stats.totalExpenses)}</div>
            </div>
            <div class="stat-card success tilt-card">
                <div class="glare"></div>
                <h3>Clientes</h3>
                <div class="value">${state.stats.clientCount}</div>
            </div>
        </div>

        <div class="profit-meter">
            <h4>Beneficio Real Proyectado</h4>
            <div class="amount" id="profit-val">${formatMoney(netProfit)}</div>
            <p style="color: var(--ink-soft); font-size: 0.85rem; margin-top: 0.5rem;">Ingresos Facturados - Gastos Registrados</p>
        </div>

        <div class="data-section" style="margin-top: 2rem;">
            <div class="section-header">
                <h3>Business Intelligence & KPIs</h3>
            </div>
            <div class="stats-grid">
                <div class="stat-card info tilt-card">
                    <div class="glare"></div>
                    <h3>Margen de Beneficio</h3>
                    <div class="value">${state.stats.totalBilled > 0 ? ((netProfit / state.stats.totalBilled) * 100).toFixed(1) : 0}%</div>
                    <p style="font-size:0.7rem; opacity:0.6; margin-top:0.4rem;">Eficiencia operativa actual</p>
                </div>
                <div class="stat-card info tilt-card">
                    <div class="glare"></div>
                    <h3>Ticket Medio</h3>
                    <div class="value">${state.stats.invoiceCount > 0 ? formatMoney(state.stats.totalBilled / state.stats.invoiceCount) : '0.00 €'}</div>
                    <p style="font-size:0.7rem; opacity:0.6; margin-top:0.4rem;">Valor promedio por factura</p>
                </div>
                <div class="stat-card info tilt-card">
                    <div class="glare"></div>
                    <h3>Ratio de Gastos</h3>
                    <div class="value">${state.stats.totalBilled > 0 ? ((state.stats.totalExpenses / state.stats.totalBilled) * 100).toFixed(1) : 0}%</div>
                    <p style="font-size:0.7rem; opacity:0.6; margin-top:0.4rem;">Impacto de costes en ventas</p>
                </div>
                <div class="stat-card info tilt-card">
                    <div class="glare"></div>
                    <h3>Health Score</h3>
                    <div class="value">${netProfit > 0 ? '94/100' : '42/100'}</div>
                    <p style="font-size:0.7rem; opacity:0.6; margin-top:0.4rem;">Salud financiera general</p>
                </div>
            </div>
        </div>

        <div class="data-section" style="margin-top: 2rem;">
            <div class="table-card" style="padding: 1.5rem; background: var(--bg-card);">
                <div class="section-header">
                    <h3>Rendimiento Mensual</h3>
                </div>
                <canvas id="revenueChart" style="width:100%; height:320px;"></canvas>
            </div>
        </div>

        <div class="data-section">
            <div class="section-header">
                <h3>Actividad Reciente</h3>
                <button class="btn btn-ghost btn-sm" onclick="navigateTo('invoices')">Ver todo <i data-lucide="arrow-right"></i></button>
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
                            <tr style="cursor:pointer" onclick="editInvoice(${inv.id})">
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

    setTimeout(() => {
        setupTiltEffect();
        const ctx = document.getElementById('revenueChart');
        if (ctx && state.chartData) {
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: state.chartData.labels.map(l => {
                        const [y, m] = l.split('-');
                        const date = new Date(y, m - 1);
                        return date.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase();
                    }),
                    datasets: [
                        {
                            label: 'Ingresos',
                            data: state.chartData.data,
                            backgroundColor: '#00d2ff',
                            borderRadius: 6,
                            borderWidth: 0,
                            barThickness: 20,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#171a20',
                            padding: 12,
                            titleFont: { size: 13, weight: 'bold' },
                            bodyFont: { size: 13 },
                            displayColors: false,
                            callbacks: {
                                label: (ctx) => `FACTURADO: ${formatMoney(ctx.raw)}`
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                            ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
                        }
                    }
                }
            });
        }
    }, 100);
}

function setupTiltEffect() {
    document.querySelectorAll('.tilt-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const xc = rect.width / 2;
            const yc = rect.height / 2;
            const dx = x - xc;
            const dy = y - yc;
            
            gsap.to(card, {
                rotateY: dx / 30, // Reducido de 15 para más elegancia
                rotateX: -dy / 25, // Reducido de 10
                duration: 0.8, // Aumentado para suavidad
                ease: 'power3.out'
            });

            const glare = card.querySelector('.glare');
            if (glare) {
                gsap.to(glare, {
                    background: `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.08), transparent)`,
                    duration: 0.2
                });
            }
        });

        card.addEventListener('mouseleave', () => {
            gsap.to(card, { rotateY: 0, rotateX: 0, duration: 1.2, ease: 'elastic.out(1, 0.5)' });
        });
    });
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
                            <label>Vencimiento (Opcional)</label>
                            <input type="date" id="inv-due-date" value="${state.newInvoice.due_date || ''}" class="premium-input">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="grid-column: span 2">
                            <label>Observaciones / Notas de Factura</label>
                            <textarea id="inv-notes" class="premium-input" placeholder="Ej: Trabajo correspondiente a la campaña de mayo..." rows="2" style="resize: vertical;">${state.newInvoice.notes || ''}</textarea>
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
                    <div class="tax-settings" style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <div class="tax-field" style="display: flex; justify-content: space-between; align-items: center;">
                            <label>Descuento (%)</label>
                            <input type="number" id="discount-rate" value="${state.newInvoice.discount_rate}" min="0" step="0.01" class="premium-input sm-input" style="width: 70px;">
                        </div>
                        <div class="tax-field" style="display: flex; justify-content: space-between; align-items: center;">
                            <label>IVA (%)</label>
                            <input type="number" id="vat-rate" value="${state.newInvoice.vat_rate}" min="0" step="0.01" class="premium-input sm-input" style="width: 70px;">
                        </div>
                        <div class="tax-field" style="display: flex; justify-content: space-between; align-items: center;">
                            <label>IRPF (%)</label>
                            <input type="number" id="irpf-rate" value="${state.newInvoice.irpf_rate}" min="0" step="0.01" class="premium-input sm-input" style="width: 70px;">
                        </div>
                    </div>
                    <div class="editor-actions">
                        <button class="btn btn-primary btn-block" id="save-invoice">
                            <i data-lucide="zap"></i> ${state.isEditing ? 'Actualizar Factura' : 'Generar Factura'}
                        </button>
                        ${state.isEditing ? `
                        <button class="btn btn-ghost btn-block" id="duplicate-invoice">
                            <i data-lucide="copy"></i> Duplicar
                        </button>
                        ` : ''}
                        <button class="btn btn-ghost btn-block" id="clear-invoice">
                            <i data-lucide="refresh-ccw"></i> Cancelar
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
            <div class="section-header">
                <h3>Historial de Facturación</h3>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <div class="search-box" style="position:relative; margin-right:1rem;">
                         <input type="text" id="search-invoices" class="premium-input" placeholder="Buscar..." style="padding-right: 2.5rem; max-width: 180px; height: 36px;">
                    </div>
                    <button class="btn btn-ghost btn-sm filter-btn active" data-filter="ALL">Todas</button>
                    <button class="btn btn-ghost btn-sm filter-btn" data-filter="PENDING">Pendientes</button>
                    <button class="btn btn-ghost btn-sm filter-btn" data-filter="PAID">Cobradas</button>
                </div>
            </div>
            <div class="table-card">
                <table id="invoices-table-main">
                    <thead>
                        <tr>
                            <th>Referencia</th>
                            <th>Cliente</th>
                            <th>Fecha</th>
                            <th>Subtotal</th>
                            <th>Total</th>
                            <th>Estado</th>
                            <th style="text-align: right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="invoices-tbody">
                        ${renderInvoiceRows(state.invoices)}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    setupInvoiceListeners();
}

function renderInvoiceRows(invoices) {
    return invoices.map((inv) => `
        <tr data-status="${inv.status}">
            <td class="font-mono font-bold">${inv.number}</td>
            <td>${inv.client_name}</td>
            <td>${inv.date}</td>
            <td class="font-mono">${formatMoney(inv.subtotal)}</td>
            <td class="font-mono font-bold" style="color: var(--acid)">${formatMoney(inv.total)}</td>
            <td>
                <select class="status-select ${inv.status.toLowerCase()}" data-id="${inv.id}">
                    <option value="PENDING" ${inv.status === 'PENDING' ? 'selected' : ''}>PENDIENTE</option>
                    <option value="PAID" ${inv.status === 'PAID' ? 'selected' : ''}>COBRADA</option>
                    <option value="CANCELLED" ${inv.status === 'CANCELLED' ? 'selected' : ''}>ANULADA</option>
                </select>
            </td>
            <td style="text-align: right">
                <div style="display:flex; gap:0.4rem; justify-content:flex-end;">
                    <button class="btn-icon-delete" title="Editar" style="border-color:var(--acid); color:var(--acid); background:var(--acid-soft);" onclick="editInvoice(${inv.id})"><i data-lucide="edit-3"></i></button>
                    <button class="btn-icon-delete" title="PDF" style="border-color:var(--ok); color:var(--ok); background:rgba(0,210,255,0.1);" onclick="window.open('/api/invoices/${inv.id}/pdf')"><i data-lucide="download"></i></button>
                    <button class="btn-icon-delete delete-invoice" title="Borrar" data-id="${inv.id}"><i data-lucide="trash-2"></i></button>
                </div>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" style="text-align:center; padding: 2rem;">No se encontraron facturas</td></tr>';
}

function setupInvoiceListeners() {
    if (window.lucide) window.lucide.createIcons();

    document.getElementById('search-invoices')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('#invoices-tbody tr').forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            document.querySelectorAll('#invoices-tbody tr').forEach(row => {
                if (filter === 'ALL' || row.dataset.status === filter) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    });

    document.querySelectorAll('.status-select').forEach((select) => {
        select.addEventListener('change', async (e) => {
            const newStatus = e.target.value;
            const invoiceId = e.target.dataset.id;
            select.className = `status-select ${newStatus.toLowerCase()}`;
            try {
                await requestJSON(`/api/invoices/${invoiceId}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
                showNotification('Estado actualizado');
                fetchData();
            } catch (error) {
                showNotification(error.message, 'danger');
                renderPage();
            }
        });
    });

    document.querySelectorAll('.delete-invoice').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!confirm('¿Seguro que quieres eliminar esta factura?')) return;
            try {
                await requestJSON(`/api/invoices/${btn.dataset.id}`, { method: 'DELETE' });
                showNotification('Factura eliminada');
                await renderPage();
            } catch (error) {
                showNotification(error.message, 'danger');
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
                    <div class="section-header" style="display: flex; justify-content: flex-end; padding: 1rem 1.5rem 0 1.5rem;">
                        <div class="search-box" style="position: relative; width: 100%; max-width: 300px;">
                            <i data-lucide="search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); width: 18px; height: 18px;"></i>
                            <input type="text" id="search-clients" class="premium-input" placeholder="Buscar cliente..." style="padding-left: 2.5rem; width: 100%;">
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>CIF</th>
                                <th style="text-align: right">Total Facturado</th>
                                <th style="text-align: right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="clients-tbody">
                            ${state.clients.map((c) => {
                                const totalBilled = state.invoices
                                    .filter(inv => inv.client_id === c.id && inv.status !== 'CANCELLED')
                                    .reduce((acc, inv) => acc + inv.total, 0);
                                return `
                                    <tr>
                                        <td>
                                            <div class="font-bold">${c.name}</div>
                                            <div style="font-size:0.75rem; color:var(--ink-soft)">${c.email || ''}</div>
                                        </td>
                                        <td class="font-mono">${c.tax_id || '-'}</td>
                                        <td style="text-align: right; font-weight: 800; color: var(--acid)">${formatMoney(totalBilled)}</td>
                                        <td style="text-align: right">
                                            <button class="btn btn-ghost btn-sm delete-client" data-id="${c.id}" style="color: var(--hot)">
                                                <i data-lucide="trash-2"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="4">No hay clientes</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.getElementById('search-clients')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('#clients-tbody tr').forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    });

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

    document.getElementById('discount-rate').addEventListener('input', (e) => {
        state.newInvoice.discount_rate = Math.max(0, asNumber(e.target.value, 0));
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

    document.getElementById('inv-notes')?.addEventListener('input', (e) => {
        state.newInvoice.notes = e.target.value;
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
            discount_rate: state.newInvoice.discount_rate,
            vat_rate: state.newInvoice.vat_rate,
            irpf_rate: state.newInvoice.irpf_rate,
            notes: state.newInvoice.notes,
            items: getCleanInvoiceItems(),
            status: 'PENDING'
        };

        const validationError = validateInvoicePayload(payload);
        if (validationError) {
            showNotification(validationError, 'danger');
            return;
        }

        try {
            const method = state.isEditing ? 'PUT' : 'POST';
            const url = state.isEditing ? `/api/invoices/${state.editingInvoiceId}` : '/api/invoices';
            
            await requestJSON(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            state.isEditing = false;
            state.editingInvoiceId = null;
            state.newInvoice = createInitialInvoiceState();
            showNotification(state.isEditing ? 'Factura actualizada' : 'Factura creada');
            await navigateTo('invoices');
        } catch (error) {
            showNotification(error.message, 'danger');
        }
    });

    document.getElementById('duplicate-invoice')?.addEventListener('click', () => {
        state.isEditing = false;
        state.editingInvoiceId = null;
        state.newInvoice.number = generateNextInvoiceNumber();
        showNotification('Copia creada. Revisa el número.');
        renderNewInvoice(container);
    });

    document.getElementById('clear-invoice').addEventListener('click', () => {
        if (!confirm('¿Vaciar formulario?')) return;
        state.newInvoice = createInitialInvoiceState();
        state.newInvoice.number = generateNextInvoiceNumber();
        renderNewInvoice(container);
    });
}

function renderSettings(container) {
    container.innerHTML = `
        <div class="editor-layout">
            <div class="editor-main">
                <div class="form-card">
                    <div class="form-header">
                        <h3>Datos de tu Empresa</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Nombre Fiscal o Empresa</label>
                            <input type="text" id="set-company" value="${state.settings?.company_name || ''}" class="premium-input">
                        </div>
                        <div class="form-group">
                            <label>NIF / CIF</label>
                            <input type="text" id="set-taxid" value="${state.settings?.tax_id || ''}" class="premium-input">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="grid-column: span 2">
                            <label>Dirección Fiscal</label>
                            <input type="text" id="set-address" value="${state.settings?.address || ''}" class="premium-input">
                        </div>
                    </div>
                    <div class="form-header" style="margin-top: 3rem;">
                        <h3>Datos de Contacto</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Teléfono</label>
                            <input type="text" id="set-phone" value="${state.settings?.phone || ''}" class="premium-input">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="set-email" value="${state.settings?.email || ''}" class="premium-input">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="grid-column: span 2">
                            <label>Página Web</label>
                            <input type="text" id="set-website" value="${state.settings?.website || ''}" class="premium-input">
                        </div>
                    </div>
                    <div class="form-header" style="margin-top: 3rem;">
                        <h3>Datos Bancarios (Cobro)</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Nombre del Banco</label>
                            <input type="text" id="set-bankname" value="${state.settings?.bank_name || ''}" class="premium-input">
                        </div>
                        <div class="form-group">
                            <label>IBAN</label>
                            <input type="text" id="set-iban" value="${state.settings?.iban || ''}" class="premium-input">
                        </div>
                    </div>
                    <div class="form-header" style="margin-top: 3rem;">
                        <h3>Identidad de Marca</h3>
                    </div>
                    <div class="form-row" style="align-items: center; gap: 2rem;">
                        <div style="width: 120px; height: 120px; border-radius: 12px; border: 2px dashed var(--line-bright); display: grid; place-items: center; overflow: hidden; background: var(--bg-soft);">
                            ${state.settings?.logo_url ? `<img src="${state.settings.logo_url}" style="width:100%; height:100%; object-fit:contain;">` : '<i data-lucide="image" style="opacity:0.3"></i>'}
                        </div>
                        <div style="flex: 1;">
                            <label class="btn btn-ghost" style="cursor:pointer">
                                <i data-lucide="upload"></i> Subir Logo
                                <input type="file" id="set-logo" accept="image/*" style="display:none">
                            </label>
                            <p style="font-size:0.75rem; color:var(--ink-soft); margin-top:0.5rem;">Se recomienda formato PNG transparente (Máx 500KB)</p>
                        </div>
                    </div>

                    <div class="form-header" style="margin-top: 3rem;">
                        <h3>Preferencias e Impuestos</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Prefijo de Factura</label>
                            <input type="text" id="set-prefix" value="${state.settings?.invoice_prefix || 'FAC-'}" class="premium-input">
                        </div>
                        <div class="form-group">
                            <label>Mensaje Pie de Factura</label>
                            <input type="text" id="set-footer" value="${state.settings?.invoice_footer || ''}" class="premium-input">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>IVA por Defecto (%)</label>
                            <input type="number" id="set-vat" value="${state.settings?.default_vat_rate || 21}" step="0.01" class="premium-input">
                        </div>
                        <div class="form-group">
                            <label>IRPF por Defecto (%)</label>
                            <input type="number" id="set-irpf" value="${state.settings?.default_irpf_rate || 15}" step="0.01" class="premium-input">
                        </div>
                    </div>
                    <button class="btn btn-primary" id="save-settings" style="margin-top: 1rem;">
                        <i data-lucide="save"></i> Guardar Configuración
                    </button>
                </div>
            </div>
        </div>
    `;

    let currentLogoBase64 = state.settings?.logo_url || '';
    document.getElementById('set-logo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                currentLogoBase64 = event.target.result;
                showNotification('Logo cargado. Guarda para aplicar.');
                renderSettings(container);
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('save-settings').addEventListener('click', async () => {
        const payload = {
            company_name: document.getElementById('set-company').value.trim(),
            tax_id: document.getElementById('set-taxid').value.trim(),
            address: document.getElementById('set-address').value.trim(),
            phone: document.getElementById('set-phone').value.trim(),
            email: document.getElementById('set-email').value.trim(),
            website: document.getElementById('set-website').value.trim(),
            bank_name: document.getElementById('set-bankname').value.trim(),
            iban: document.getElementById('set-iban').value.trim(),
            invoice_prefix: document.getElementById('set-prefix').value.trim(),
            invoice_footer: document.getElementById('set-footer').value.trim(),
            default_vat_rate: asNumber(document.getElementById('set-vat').value, 21),
            default_irpf_rate: asNumber(document.getElementById('set-irpf').value, 15),
            logo_url: currentLogoBase64
        };

        try {
            await requestJSON('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showNotification('Configuración guardada correctamente');
            await fetchData();
        } catch (error) {
            showNotification(error.message, 'danger');
        }
    });
}

function updateTotals() {
    const grossSubtotal = state.newInvoice.items.reduce(
        (acc, item) => acc + (Math.max(0, asNumber(item.quantity, 0)) * Math.max(0, asNumber(item.unit_price, 0))),
        0
    );
    const discountAmount = grossSubtotal * (Math.max(0, asNumber(state.newInvoice.discount_rate, 0)) / 100);
    const subtotal = grossSubtotal - discountAmount;

    const vat = subtotal * (Math.max(0, asNumber(state.newInvoice.vat_rate, 0)) / 100);
    const irpf = subtotal * (Math.max(0, asNumber(state.newInvoice.irpf_rate, 0)) / 100);
    const total = subtotal + vat - irpf;

    const box = document.getElementById('totals-box');
    if (box) {
        let html = `<div class="summary-row"><span>Suma de Conceptos</span><span>${formatMoney(grossSubtotal)}</span></div>`;
        if (discountAmount > 0) {
            html += `<div class="summary-row" style="color:var(--acid)"><span>Descuento (${state.newInvoice.discount_rate}%)</span><span>-${formatMoney(discountAmount)}</span></div>`;
            html += `<div class="summary-row"><span>Base Imponible</span><span>${formatMoney(subtotal)}</span></div>`;
        }

        html += `
            <div class="summary-row"><span>IVA (${state.newInvoice.vat_rate}%)</span><span>${formatMoney(vat)}</span></div>
            <div class="summary-row"><span>IRPF (-${state.newInvoice.irpf_rate}%)</span><span style="color:var(--hot)">-${formatMoney(irpf)}</span></div>
            <div class="summary-total-container">
                <div class="total-label">Total a Pagar</div>
                <div class="total-value">${formatMoney(total)}</div>
            </div>
        `;
        box.innerHTML = html;
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

function renderCalculator(container) {
    const today = new Date();
    const currentQuarter = Math.floor(today.getMonth() / 3) + 1;
    const currentYear = today.getFullYear();

    // Group invoices by quarter
    const getQuarterStats = (q) => {
        return state.invoices
            .filter(inv => {
                const d = new Date(inv.date);
                const invQ = Math.floor(d.getMonth() / 3) + 1;
                return invQ === q && d.getFullYear() === currentYear && inv.status !== 'CANCELLED';
            })
            .reduce((acc, inv) => ({
                iva: acc.iva + (inv.vat_amount || 0),
                irpf: acc.irpf + (inv.irpf_amount || 0),
                total: acc.total + (inv.total || 0)
            }), { iva: 0, irpf: 0, total: 0 });
    };

    const qStats = getQuarterStats(currentQuarter);
    const totalCajaGastos = state.cashFlow.filter(m => m.type === 'EXPENSE').reduce((acc, m) => acc + m.amount, 0);

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card accent tilt-card">
                <div class="glare"></div>
                <h3>IVA a Pagar (T${currentQuarter})</h3>
                <div class="value">${formatMoney(qStats.iva)}</div>
                <p style="font-size:0.7rem; opacity:0.6; margin-top:0.4rem;">Modelos 303 proyectado</p>
            </div>
            <div class="stat-card warning tilt-card">
                <div class="glare"></div>
                <h3>Retenciones IRPF</h3>
                <div class="value">${formatMoney(qStats.irpf)}</div>
                <p style="font-size:0.7rem; opacity:0.6; margin-top:0.4rem;">Modelo 130/111 proyectado</p>
            </div>
            <div class="stat-card hot tilt-card">
                <div class="glare"></div>
                <h3>Gastos Deducibles</h3>
                <div class="value">${formatMoney(totalCajaGastos)}</div>
                <p style="font-size:0.7rem; opacity:0.6; margin-top:0.4rem;">Gastos de explotación</p>
            </div>
             <div class="stat-card success tilt-card" onclick="window.open('/api/export/csv')" style="cursor:pointer">
                <div class="glare"></div>
                <h3>Exportar Datos</h3>
                <div class="value"><i data-lucide="file-spreadsheet"></i> CSV</div>
                <p style="font-size:0.7rem; opacity:0.6; margin-top:0.4rem;">Descargar para Excel</p>
            </div>
        </div>

        <div class="data-section">
            <div class="section-header">
                <h3>Desglose por Trimestres (${currentYear})</h3>
            </div>
            <div class="tax-report-grid">
                ${[1, 2, 3, 4].map(q => {
                    const stats = getQuarterStats(q);
                    const isCurrent = q === currentQuarter;
                    return `
                        <div class="tax-card" style="${isCurrent ? 'border-color: var(--acid); background: var(--acid-soft);' : ''}">
                            <h4>TRIMESTRE ${q} ${isCurrent ? ' (ACTUAL)' : ''}</h4>
                            <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                                <span>Facturado:</span>
                                <span class="font-mono">${formatMoney(stats.total)}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; color:var(--hot)">
                                <span>IVA (Soportado):</span>
                                <span class="font-mono">${formatMoney(stats.iva)}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; color:var(--warn)">
                                <span>IRPF (Retenido):</span>
                                <span class="font-mono">${formatMoney(stats.irpf)}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>

        <div class="editor-layout" style="margin-top: 2rem;">
            <div class="editor-main">
                <div class="form-card">
                    <div class="form-header">
                        <h3>Registrar Gasto o Venta Manual</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Concepto</label>
                            <input type="text" id="cash-desc" class="premium-input" placeholder="Ej: Compra material...">
                        </div>
                        <div class="form-group">
                            <label>Importe (€)</label>
                            <input type="number" id="cash-amount" class="premium-input" placeholder="0.00">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Tipo</label>
                            <select id="cash-type" class="premium-input">
                                <option value="EXPENSE">Gasto (Deducible)</option>
                                <option value="INCOME">Ingreso (Sin factura)</option>
                            </select>
                        </div>
                        <div class="form-group" style="display:flex; align-items:flex-end;">
                             <button class="btn btn-primary btn-block" id="add-cash-move">
                                <i data-lucide="plus"></i> Guardar Movimiento
                            </button>
                        </div>
                    </div>
                </div>

                <div class="table-card" style="margin-top: 1.5rem;">
                    <div class="section-header" style="padding: 1.2rem 1.2rem 0;">
                        <h3>Últimos Movimientos</h3>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Concepto</th>
                                <th style="text-align: right">Importe</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${state.cashFlow.slice(0, 10).map(m => `
                                <tr>
                                    <td>${m.date}</td>
                                    <td>${m.description}</td>
                                    <td style="text-align: right; font-weight: bold; color: ${m.type === 'INCOME' ? 'var(--ok)' : 'var(--hot)'}">
                                        ${m.type === 'INCOME' ? '+' : '-'} ${formatMoney(m.amount)}
                                    </td>
                                    <td style="text-align: right">
                                        <button class="btn-icon-delete delete-cash" data-id="${m.id}"><i data-lucide="trash-2"></i></button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="4">Sin movimientos</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    setupTiltEffect();
    setupCalculatorListeners();
}

function setupCalculatorListeners() {
    document.getElementById('add-cash-move')?.addEventListener('click', async () => {
        const desc = document.getElementById('cash-desc').value.trim();
        const amount = asNumber(document.getElementById('cash-amount').value, 0);
        const type = document.getElementById('cash-type').value;

        if (!desc || amount <= 0) {
            showNotification('Completa los campos correctamente', 'danger');
            return;
        }

        try {
            await requestJSON('/api/cash-flow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: desc, amount, type })
            });
            showNotification('Movimiento registrado');
            await renderPage();
        } catch (error) {
            showNotification(error.message, 'danger');
        }
    });

    document.querySelectorAll('.delete-cash').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('¿Borrar movimiento?')) return;
            try {
                await requestJSON(`/api/cash-flow/${btn.dataset.id}`, { method: 'DELETE' });
                showNotification('Eliminado');
                await renderPage();
            } catch (error) {
                showNotification(error.message, 'danger');
            }
        });
    });
}


function updateSidebarWidget() {
    const widget = document.getElementById('sidebar-goal-widget');
    if (!widget || !state.stats) return;
    
    const goal = 10000;
    const progress = Math.min((state.stats.totalBilled / goal) * 100, 100);
    
    widget.style.display = 'block';
    widget.innerHTML = `
        <h4 style="font-size: 0.65rem; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.8rem;">Objetivo Mensual</h4>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem; font-family:var(--mono); font-size:0.75rem;">
            <span style="color:var(--acid); font-weight:bold;">${progress.toFixed(0)}%</span>
            <span>${formatMoney(goal)}</span>
        </div>
        <div style="width:100%; height:6px; background:var(--line-soft); border-radius:99px; overflow:hidden;">
            <div style="width:${progress}%; height:100%; background:linear-gradient(90deg, var(--acid), #00ff88); box-shadow: 0 0 10px var(--acid-glow);"></div>
        </div>
    `;
}

navigateTo('dashboard');
