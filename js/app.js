/**
 * Lógica de la tienda — Chocolat Suprême (PR2)
 * Carrito, Mi cuenta, MQTT y pedidos. El HTML solo tiene la estructura.
 */

// catálogo fijo: los tres sabores de la práctica
const todosSabores = [
    { id: 1, nombre: "Chocolate Negro 70%", precio: 0.75, img: "Caja_Negro.png", peso: "200g", bombones: 16,
      descripcionLarga: "El Chocolate Negro 70% es una explosion de pureza. Cacao ecuatoriano.",
      ingredientes: "Pasta de cacao, azucar, manteca de cacao, lecitina de soja, vainilla.",
      alergias: "Puede contener frutos secos, leche." },
    { id: 2, nombre: "Caramelo Salado", precio: 0.80, img: "Caja_Caramelo.png", peso: "200g", bombones: 16,
      descripcionLarga: "Dulce de leche con sal marina de Guerande. Textura cremosa.",
      ingredientes: "Azucar, nata, mantequilla, sal, glucosa, cacao.",
      alergias: "Lacteos." },
    { id: 3, nombre: "Avellana Praline", precio: 0.85, img: "Caja_Avellana.png", peso: "200g", bombones: 16,
      descripcionLarga: "Praline crujiente de avellanas tostadas con chocolate con leche.",
      ingredientes: "Avellanas, chocolate con leche, azucar.",
      alergias: "Frutos secos, leche." }
];
const saboresPersonal = todosSabores;

let carrito = [];
let cantidadesIndustrial = {};
let cajasGrandesPersonal = 1;
let cantidadesPersonal = {};

let clienteMqtt = null;
let mqttConectado = false;

// lo que guardamos en sessionStorage al rellenar Mi cuenta
let datosCliente = {
    tipo: 'autonomo',
    cif: '',
    nombreApellidos: '',
    telefono: '',
    email: '',
    empresa: '',
    departamento: '',
    numCuenta: '', cvv: '', fechaCad: '',
    direccionEnvio: '', codigoPostal: '', direccionFiscal: '', codigoPostalFiscal: '',
    formaJuridica: 'SL',
    iban: '', titularCuenta: '', concepto: '',
    tarjetas: [],
    idCliente: null
};

let empresasReparto = [];
const EMPRESAS_REPARTO_FALLBACK = [
    { id: 1, nombre: 'TransIberica Logistica' },
    { id: 2, nombre: 'Levante Express Cargo' },
    { id: 3, nombre: 'RutaSegura Distribucion' },
    { id: 4, nombre: 'Envios Turia 24h' },
    { id: 5, nombre: 'Mediterraneo Parcel' },
    { id: 6, nombre: 'ValenPack Transportes' },
    { id: 7, nombre: 'CargoNorte Sur' },
    { id: 8, nombre: 'BlueRoad Reparto' },
    { id: 9, nombre: 'FastBox Mensajeria' },
    { id: 10, nombre: 'IberUnion Logistics' }
];

function enmascararCuenta(num) {
    const n = String(num || '').replace(/\s/g, '');
    if (n.length < 4) return '****';
    return '**** **** **** ' + n.slice(-4);
}

function obtenerTarjetaPrincipal() {
    if (!Array.isArray(datosCliente.tarjetas) || datosCliente.tarjetas.length === 0) return null;
    return datosCliente.tarjetas.find(t => t.esPrincipal) || datosCliente.tarjetas[0];
}

function syncLegacyDesdeTarjetas() {
    const p = obtenerTarjetaPrincipal();
    if (p) {
        datosCliente.numCuenta = p.numCuenta || '';
        datosCliente.cvv = p.cvv || '';
        datosCliente.fechaCad = p.fechaCad || '';
    } else {
        datosCliente.numCuenta = '';
        datosCliente.cvv = '';
        datosCliente.fechaCad = '';
    }
}

function migrarTarjetasLegacy() {
    if (!Array.isArray(datosCliente.tarjetas)) datosCliente.tarjetas = [];
    if (datosCliente.tarjetas.length === 0 && datosCliente.numCuenta) {
        datosCliente.tarjetas.push({
            id: 't_' + Date.now(),
            numCuenta: datosCliente.numCuenta,
            cvv: datosCliente.cvv || '',
            fechaCad: datosCliente.fechaCad || '',
            esPrincipal: true
        });
    }
    if (datosCliente.tarjetas.length > 0 && !datosCliente.tarjetas.some(t => t.esPrincipal)) {
        datosCliente.tarjetas[0].esPrincipal = true;
    }
    syncLegacyDesdeTarjetas();
}

function renderListaTarjetas() {
    const cont = document.getElementById('listaTarjetas');
    if (!cont) return;
    migrarTarjetasLegacy();
    if (!datosCliente.tarjetas.length) {
        cont.innerHTML = '<p style="font-size:0.85rem;color:#8b6914;">No hay tarjetas. Añade al menos una.</p>';
        return;
    }
    cont.innerHTML = datosCliente.tarjetas.map(t => `
        <div class="tarjeta-item ${t.esPrincipal ? 'principal' : ''}">
            <div>
                <strong>${enmascararCuenta(t.numCuenta)}</strong>
                ${t.esPrincipal ? '<span class="tarjeta-badge">Principal</span>' : ''}
                <div style="font-size:0.8rem;color:#6b5344;">Caduca: ${t.fechaCad || '—'}</div>
            </div>
            <div class="tarjeta-acciones">
                ${!t.esPrincipal ? `<button type="button" class="btn-tarjeta" data-principal="${t.id}">Hacer principal</button>` : ''}
                <button type="button" class="btn-tarjeta eliminar" data-eliminar="${t.id}">Eliminar</button>
            </div>
        </div>
    `).join('');
    cont.querySelectorAll('[data-principal]').forEach(btn => {
        btn.onclick = () => marcarTarjetaPrincipal(btn.getAttribute('data-principal'));
    });
    cont.querySelectorAll('[data-eliminar]').forEach(btn => {
        btn.onclick = () => eliminarTarjeta(btn.getAttribute('data-eliminar'));
    });
}

function marcarTarjetaPrincipal(id) {
    datosCliente.tarjetas.forEach(t => { t.esPrincipal = (t.id === id); });
    syncLegacyDesdeTarjetas();
    renderListaTarjetas();
}

function eliminarTarjeta(id) {
    if (datosCliente.tarjetas.length <= 1) {
        alert('Debes tener al menos una tarjeta registrada.');
        return;
    }
    const eraPrincipal = datosCliente.tarjetas.find(t => t.id === id)?.esPrincipal;
    datosCliente.tarjetas = datosCliente.tarjetas.filter(t => t.id !== id);
    if (eraPrincipal && datosCliente.tarjetas.length) datosCliente.tarjetas[0].esPrincipal = true;
    syncLegacyDesdeTarjetas();
    renderListaTarjetas();
}

function anadirTarjetaDesdeFormulario() {
    const numCuenta = document.getElementById('nuevaNumCuenta').value.trim();
    const cvv = document.getElementById('nuevaCvv').value.trim();
    const fechaCad = document.getElementById('nuevaFechaCad').value.trim();
    if (!numCuenta || numCuenta.replace(/\s/g, '').length < 8) {
        alert('Introduce un número de cuenta válido (mínimo 8 dígitos).');
        return;
    }
    if (!cvv || cvv.length < 3) {
        alert('Introduce un CVV válido (3 o 4 dígitos).');
        return;
    }
    if (!fechaCad) {
        alert('Introduce la fecha de caducidad (MM/AA).');
        return;
    }
    const duplicada = datosCliente.tarjetas.some(
        t => t.numCuenta.replace(/\s/g, '') === numCuenta.replace(/\s/g, '')
    );
    if (duplicada) {
        alert('Esa tarjeta ya está registrada.');
        return;
    }
    const esPrimera = datosCliente.tarjetas.length === 0;
    datosCliente.tarjetas.push({
        id: 't_' + Date.now(),
        numCuenta,
        cvv,
        fechaCad,
        esPrincipal: esPrimera
    });
    document.getElementById('nuevaNumCuenta').value = '';
    document.getElementById('nuevaCvv').value = '';
    document.getElementById('nuevaFechaCad').value = '';
    syncLegacyDesdeTarjetas();
    renderListaTarjetas();
}

function cargarDatosCliente() {
    const saved = sessionStorage.getItem('clienteData');   
    if (saved) {
        try {
            const data = JSON.parse(saved);
            datosCliente = { ...datosCliente, ...data };
            migrarTarjetasLegacy();
            document.getElementById('tipoCliente').value = datosCliente.tipo;
            document.getElementById('cif').value = datosCliente.cif;
            document.getElementById('nombreApellidos').value = datosCliente.nombreApellidos;
            document.getElementById('telefonoClienteCuenta').value = datosCliente.telefono;
            document.getElementById('emailCliente').value = datosCliente.email;
            document.getElementById('nombreEmpresa').value = datosCliente.empresa;
            document.getElementById('departamento').value = datosCliente.departamento;
            document.getElementById('formaJuridica').value = datosCliente.formaJuridica || 'SL';
            document.getElementById('direccionEnvio').value = datosCliente.direccionEnvio;
            document.getElementById('codigoPostal').value = datosCliente.codigoPostal;
            document.getElementById('direccionFiscal').value = datosCliente.direccionFiscal;
            document.getElementById('codigoPostalFiscal').value = datosCliente.codigoPostalFiscal;
            document.getElementById('iban').value = datosCliente.iban;
            document.getElementById('titularCuenta').value = datosCliente.titularCuenta;
            document.getElementById('concepto').value = datosCliente.concepto;
            toggleCamposPago();
            renderListaTarjetas();
        } catch(e) {}
    } else {
        renderListaTarjetas();
    }
}

function guardarDatosCliente() {
        sessionStorage.setItem('clienteData', JSON.stringify(datosCliente));
}

function toggleCamposPago() {
    const tipo = document.getElementById('tipoCliente').value;
    const esEmpresa = tipo === 'empresa';
    document.getElementById('pagoAutonomo').style.display = esEmpresa ? 'none' : 'block';
    document.getElementById('pagoEmpresa').style.display = esEmpresa ? 'block' : 'none';
    document.getElementById('empresaFields').style.display = esEmpresa ? 'block' : 'none';
    document.getElementById('formaJuridicaWrap').style.display = esEmpresa ? 'block' : 'none';
    if (!esEmpresa) renderListaTarjetas();
}

function validarDireccionesCliente() {
    return datosCliente.direccionEnvio && datosCliente.codigoPostal
        && datosCliente.direccionFiscal && datosCliente.codigoPostalFiscal;
}

function renderSelectEmpresasReparto() {
    const sel = document.getElementById('empresaReparto');
    if (!sel) return;
    const lista = empresasReparto.length ? empresasReparto : EMPRESAS_REPARTO_FALLBACK;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Selecciona empresa de reparto —</option>'
        + lista.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
    if (prev) sel.value = prev;
}

function solicitarEmpresasReparto() {
    publicarMqtt('tienda/empresas_reparto/solicitar', { solicitar: true });
    if (!empresasReparto.length) {
        empresasReparto = EMPRESAS_REPARTO_FALLBACK.slice();
        renderSelectEmpresasReparto();
    }
}

function formatearFechaHora(iso) {
    if (!iso) return new Date().toLocaleString('es-ES');
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES');
}

function describirDetalleCarrito() {
    if (!carrito.length) return '<p>Sin líneas en el carrito.</p>';
    let html = '<ul style="margin:0.3rem 0;padding-left:1.2rem;">';
    carrito.forEach((item, idx) => {
        html += `<li><strong>${item.tipo === 'industrial' ? 'Industrial' : 'Personalizado'}</strong> — ${item.descripcion || ''} — ${item.total.toFixed(2)} €`;
        if (item.tipo === 'industrial' && item.detalles) {
            const partes = Object.entries(item.detalles).filter(([, v]) => v > 0)
                .map(([s, v]) => `${s}: ${v} caja(s) grande(s)`);
            if (partes.length) html += `<br><small>Sabores: ${partes.join('; ')}</small>`;
        }
        if (item.tipo === 'personalizado') {
            html += `<br><small>Cajas grandes: ${item.cajas || 0} (máx. 4)</small>`;
        }
        html += '</li>';
    });
    html += '</ul>';
    return html;
}

function renderResumenPedidoDetalle() {
    const div = document.getElementById('resumenPedidoDetalle');
    if (!div) return;
    if (!carrito.length) {
        div.innerHTML = '';
        return;
    }
    const total = carrito.reduce((a, i) => a + i.total, 0);
    div.innerHTML = `<h4>Detalle del pedido</h4>${describirDetalleCarrito()}<p><strong>Precio total estimado:</strong> ${total.toFixed(2)} €</p>`;
}

document.getElementById('tipoCliente').addEventListener('change', toggleCamposPago);
document.getElementById('btnAnadirTarjeta').addEventListener('click', anadirTarjetaDesdeFormulario);

document.getElementById('formLogin').addEventListener('submit', (e) => {
    e.preventDefault();
    datosCliente.tipo = document.getElementById('tipoCliente').value;
    datosCliente.cif = document.getElementById('cif').value;
    datosCliente.nombreApellidos = document.getElementById('nombreApellidos').value;
    datosCliente.telefono = document.getElementById('telefonoClienteCuenta').value;
    datosCliente.email = document.getElementById('emailCliente').value;
    datosCliente.empresa = document.getElementById('nombreEmpresa').value;
    datosCliente.departamento = document.getElementById('departamento').value;
    datosCliente.formaJuridica = document.getElementById('formaJuridica').value;
    datosCliente.direccionEnvio = document.getElementById('direccionEnvio').value.trim();
    datosCliente.codigoPostal = document.getElementById('codigoPostal').value.trim();
    datosCliente.direccionFiscal = document.getElementById('direccionFiscal').value.trim();
    datosCliente.codigoPostalFiscal = document.getElementById('codigoPostalFiscal').value.trim();
    datosCliente.iban = document.getElementById('iban').value;
    datosCliente.titularCuenta = document.getElementById('titularCuenta').value;
    datosCliente.concepto = document.getElementById('concepto').value;
    migrarTarjetasLegacy();
    syncLegacyDesdeTarjetas();

    if (!datosCliente.cif || !datosCliente.nombreApellidos || !datosCliente.telefono || !datosCliente.email) {
        document.getElementById('loginFeedback').innerHTML = '<div style="color:red;">Todos los campos obligatorios deben estar rellenos.</div>';
        return;
    }
    if (datosCliente.tipo === 'autonomo') {
        if (!datosCliente.tarjetas.length) {
            document.getElementById('loginFeedback').innerHTML = '<div style="color:red;">Añade al menos una tarjeta de pago.</div>';
            return;
        }
    } else {
        if (!datosCliente.empresa || !datosCliente.departamento) {
            document.getElementById('loginFeedback').innerHTML = '<div style="color:red;">Completa empresa y departamento.</div>';
            return;
        }
        if (!datosCliente.iban || !datosCliente.titularCuenta || !datosCliente.concepto) {
            document.getElementById('loginFeedback').innerHTML = '<div style="color:red;">Completa los datos bancarios de la empresa.</div>';
            return;
        }
    }
    if (!validarDireccionesCliente()) {
        document.getElementById('loginFeedback').innerHTML = '<div style="color:red;">Completa dirección de envío, CP, dirección fiscal y CP fiscal.</div>';
        return;
    }
    guardarDatosCliente();
    publicarMqtt('tienda/cuenta/actualizada', armarClienteMqtt());
    document.getElementById('loginFeedback').innerHTML = '<div style="color:green;">Datos guardados correctamente.</div>';
    setTimeout(() => document.getElementById('loginFeedback').innerHTML = '', 3000);
});

    // mismo JSON que espera mqtt_bridge.py al guardar en PostgreSQL
    function armarClienteMqtt() {
    const d = datosCliente;
    const dirEnv = (d.direccionEnvio || '').trim();
    const cp = (d.codigoPostal || '').trim();
    let direccion = dirEnv;
    if (dirEnv && cp) direccion = `${dirEnv}, CP ${cp}`;
    else if (cp) direccion = `CP ${cp}`;
    const base = {
        tipo: d.tipo,
        tipoCliente: d.tipo,
        formaJuridica: d.tipo === 'empresa' ? (d.formaJuridica || 'SL') : 'autonomo',
        cif: d.cif,
        nombre: d.nombreApellidos,
        nombreApellidos: d.nombreApellidos,
        telefono: d.telefono,
        email: d.email,
        direccion: direccion,
        direccionEnvio: d.direccionEnvio || '',
        codigoPostal: d.codigoPostal || '',
        direccionFiscal: d.direccionFiscal || '',
        codigoPostalFiscal: d.codigoPostalFiscal || '',
        empresa: d.empresa || '',
        nombreEmpresa: d.empresa || '',
        departamento: d.departamento || '',
        idCliente: d.idCliente || null
    };
    if (d.tipo === 'autonomo') {
        migrarTarjetasLegacy();
        const principal = obtenerTarjetaPrincipal();
        base.tarjetas = (d.tarjetas || []).map(t => ({
            numCuenta: t.numCuenta,
            cvv: t.cvv,
            fechaCad: t.fechaCad,
            esPrincipal: !!t.esPrincipal
        }));
        base.pago = principal ? {
            numCuenta: principal.numCuenta,
            cvv: principal.cvv,
            fechaCad: principal.fechaCad
        } : {};
    } else {
        base.pago = {
            iban: d.iban,
            titularCuenta: d.titularCuenta,
            concepto: d.concepto
        };
    }
    return base;
}

function mostrarResumenCliente() {
    const div = document.getElementById('resumenCliente');
    if (!div) return;
    if (!datosCliente.cif) {
        div.innerHTML = '<p style="color:red;">Debes completar tus datos en "Mi cuenta" antes de confirmar el pedido.</p>';
        renderResumenPedidoDetalle();
        return;
    }
    const tipoTxt = datosCliente.tipo === 'autonomo'
        ? 'Autónomo'
        : `Empresa (${datosCliente.formaJuridica || 'SL'})`;
    let html = `<h4>Cliente</h4><p>`;
    if (datosCliente.idCliente) html += `<strong>ID cliente:</strong> ${datosCliente.idCliente}<br>`;
    html += `<strong>Tipo:</strong> ${tipoTxt}<br>`;
    html += `CIF/NIF: ${datosCliente.cif}<br>Nombre: ${datosCliente.nombreApellidos}<br>`;
    html += `Teléfono: ${datosCliente.telefono}<br>Email: ${datosCliente.email}<br>`;
    if (datosCliente.tipo === 'empresa') {
        html += `Empresa: ${datosCliente.empresa}<br>Departamento: ${datosCliente.departamento}<br>`;
    }
    html += `Envío: ${datosCliente.direccionEnvio}, CP ${datosCliente.codigoPostal}<br>`;
    html += `Fiscal: ${datosCliente.direccionFiscal}, CP ${datosCliente.codigoPostalFiscal}`;
    html += `</p><h4>Pago</h4><p>`;
    if (datosCliente.tipo === 'autonomo') {
        migrarTarjetasLegacy();
        html += `Tarjetas (${datosCliente.tarjetas.length}): `;
        html += datosCliente.tarjetas.map(t =>
            `${enmascararCuenta(t.numCuenta)}${t.esPrincipal ? ' (principal)' : ''}`
        ).join(' · ');
    } else {
        html += `IBAN ${datosCliente.iban}<br>Titular: ${datosCliente.titularCuenta}<br>Concepto: ${datosCliente.concepto}`;
    }
    html += `</p>`;
    div.innerHTML = html;
    renderResumenPedidoDetalle();
    solicitarEmpresasReparto();
}

function mostrarConfirmacionPedido(data) {
    const div = document.getElementById('confirmacionPedido');
    if (!div || !data || !data.confirmado) return;
    const tipoPed = data.tipoPedido === 'industrial' ? 'Industrial' : 'Personalizado';
    let detallePed = '';
    if (data.tipoPedido === 'industrial' && data.detalleIndustrial && data.detalleIndustrial.length) {
        detallePed = data.detalleIndustrial.map(d => `${d.sabor}: ${d.cajasGrandes} caja(s) grande(s)`).join('<br>');
    } else if (data.detallePersonalizado && data.detallePersonalizado.length) {
        detallePed = data.detallePersonalizado.map(d =>
            `${d.cajasGrandes} caja(s) grande(s) — ${d.descripcion || ''}`
        ).join('<br>');
    } else if (data.sabores && data.sabores.length) {
        detallePed = data.sabores.join('<br>');
    }
    div.innerHTML = `
        <div style="background:#e8f5e9;border-radius:16px;padding:1rem;font-size:0.9rem;">
            <h4 style="margin:0 0 0.5rem 0;">Pedido confirmado #${data.idPedido || '?'}</h4>
            <strong>Fecha y hora:</strong> ${formatearFechaHora(data.fechaHora)}<br>
            <strong>Cliente ID:</strong> ${data.idCliente || '—'} · <strong>Nombre:</strong> ${data.nombre || '—'}<br>
            <strong>Tipo:</strong> ${data.tipoCliente === 'empresa' ? 'Empresa' : 'Autónomo'} ${data.formaJuridica && data.formaJuridica !== 'autonomo' ? '(' + data.formaJuridica + ')' : ''}<br>
            <strong>Envío:</strong> ${data.direccionEnvio || ''}, CP ${data.codigoPostal || ''}<br>
            <strong>Fiscal:</strong> ${data.direccionFiscal || ''}, CP ${data.codigoPostalFiscal || ''}<br>
            <strong>Empresa reparto:</strong> ${data.empresaReparto || '—'}<br>
            <strong>Tipo pedido:</strong> ${tipoPed}<br>
            <strong>Cajas grandes:</strong> ${data.numeroCajas ?? '—'}
            ${data.numeroCombi ? `<br><strong>Nº combinación:</strong> ${data.numeroCombi} (${data.rutaCombi || ''})` : ''}
            <br><strong>Detalle:</strong><br>${detallePed || '—'}
            <br><strong>Precio total:</strong> ${Number(data.precioTotal || 0).toFixed(2)} €
        </div>`;
    if (data.idCliente) datosCliente.idCliente = data.idCliente;
}

    // --- carrito (localStorage para no perderlo al refrescar) ---
    function guardarCarrito() { localStorage.setItem('chocoCart', JSON.stringify(carrito)); }
function actualizarContador() {
    let totalPedidos = carrito.length;
    document.getElementById('contadorCarrito').innerText = totalPedidos;
}
function renderizarCarrito() {
    const contenedor = document.getElementById('carritoItems');
    const totalSpan = document.getElementById('totalCarrito');
    if (!contenedor) return;
    if (carrito.length === 0) {
        contenedor.innerHTML = `<div style="text-align:center; padding:2rem;">No hay nada todavia</div>`;
        totalSpan.innerText = 'Total: 0,00 €';
        return;
    }
    let html = '', total = 0;
    carrito.forEach(item => {
        let subtotal = item.total;
        total += subtotal;
        html += `<div class="cart-item"><div><strong>${item.tipo === 'industrial' ? 'Pedido Industrial' : 'Pedido Personalizado'}</strong><br><small>${item.descripcion}</small></div><div>${subtotal.toFixed(2)} €</div></div>`;
    });
    contenedor.innerHTML = html;
    totalSpan.innerText = `Total: ${total.toFixed(2)} €`;
    renderResumenPedidoDetalle();
}
function vaciarCarrito() {
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    actualizarContador();
    publicarMqtt('tienda/carrito', { accion: 'VACIADO' });
}
function mostrarFeedback(msg, tipo) {
    const div = document.getElementById('feedback');
    div.innerHTML = `<div style="background:#ddebe3; padding:1rem; border-radius:28px;">${msg}</div>`;
    setTimeout(() => div.innerHTML = '', 4000);
}

    // --- MQTT: sin esto el puente Python no recibe pedidos ---
    function conectarMqtt() {
    const brokerUrl = 'wss://kf12786f.ala.us-east-1.emqxsl.com:8084/mqtt';
    const options = {
        clientId: 'web_' + Math.random().toString(16).substr(2, 8),
        username: 'web_choco',
        password: 'asdfghjPOIU2345678',   
        clean: true,
        keepalive: 60,
        reconnectPeriod: 2000
    };

    if (clienteMqtt && !clienteMqtt.disconnected) {
        clienteMqtt.end(true);
    }

    try {
        clienteMqtt = mqtt.connect(brokerUrl, options);
        clienteMqtt.on('connect', () => {
            mqttConectado = true;
            document.getElementById('estadoMqtt').innerHTML = ' 🟢 Conectado a la nube';
            console.log(' Conectado a EMQX Cloud');
            ['tienda/pedido/confirmado', 'tienda/stock/alerta', 'tienda/empresas_reparto/lista', 'tienda/cuenta/guardada', 'tienda/#'].forEach(t => {
                clienteMqtt.subscribe(t, { qos: 1 }, (err) => {
                    if (!err) console.log('Suscrito a', t);
                });
            });
            solicitarEmpresasReparto();
        });
        clienteMqtt.on('message', (topic, payload) => {
            try {
                const data = JSON.parse(payload.toString());
                console.log(`MQTT [${topic}]`, data);
                if (topic === 'tienda/empresas_reparto/lista' && Array.isArray(data.empresas)) {
                    empresasReparto = data.empresas;
                    renderSelectEmpresasReparto();
                } else if (topic === 'tienda/cuenta/guardada' && data.ok && data.idCliente) {
                    datosCliente.idCliente = data.idCliente;
                    guardarDatosCliente();
                    if (document.getElementById('seccion-cesta').classList.contains('activa')) {
                        mostrarResumenCliente();
                    }
                } else if (topic === 'tienda/pedido/confirmado' && data.confirmado) {
                    mostrarConfirmacionPedido(data);
                    let extra = data.numeroCombi ? ` Combinación nº ${data.numeroCombi}.` : '';
                    mostrarFeedback(
                        `Pedido #${data.idPedido || '?'} guardado. Cliente ${data.idCliente || '?'}.${extra}`,
                        'success'
                    );
                } else if (topic === 'tienda/stock/alerta') {
                    mostrarFeedback(data.mensaje || 'Sin stock suficiente.', 'error');
                }
            } catch (_) {
                console.log(`MQTT [${topic}]`, payload.toString());
            }
        });
        clienteMqtt.on('error', (err) => {
            mqttConectado = false;
            document.getElementById('estadoMqtt').innerHTML = ' 🔴 Error de conexión';
            console.error(' Error MQTT:', err);
        });
        clienteMqtt.on('close', () => {
            mqttConectado = false;
            document.getElementById('estadoMqtt').innerHTML = ' ⚪ Desconectado';
        });
    } catch(e) {
        console.error(e);
    }
}

function publicarMqtt(topico, mensaje) {
    if (mqttConectado && clienteMqtt && clienteMqtt.connected) {
        clienteMqtt.publish(topico, JSON.stringify(mensaje), { qos: 1 }, (err) => {
            if (err) console.error('Error publicando:', err);
            else console.log(`📡 Publicado en ${topico}:`, mensaje);
        });
    } else {
        console.warn('MQTT no conectado, no se pudo publicar');
    }
}

    // popup al pinchar en un sabor
    const modal = document.getElementById('modalSabor');
const modalInfo = document.getElementById('modalInfo');
function mostrarDetalleSabor(sabor) {
    modalInfo.innerHTML = `
        <h3>${sabor.nombre}</h3>
        <img src="${sabor.img}" style="width:100%; border-radius:24px; margin:1rem 0;">
        <p><strong>Descripcion:</strong> ${sabor.descripcionLarga}</p>
        <p><strong>Ingredientes:</strong> ${sabor.ingredientes}</p>
        <p><strong>Alergias:</strong> ${sabor.alergias}</p>
        <p><strong>Peso por cajita:</strong> ${sabor.peso} (${sabor.bombones} bombones)</p>
        <p><strong>Precio bombon:</strong> ${sabor.precio.toFixed(2)} €</p>
        <p><strong>Precio cajita (16 uds):</strong> ${(sabor.precio*16).toFixed(2)} €</p>
        <p><strong>Precio caja grande (48 cajitas = 768 uds):</strong> ${(sabor.precio*768).toFixed(2)} €</p>
    `;
    modal.style.display = 'flex';
}
document.querySelector('.cerrar-modal').onclick = () => modal.style.display = 'none';
window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

    function renderizarServicios() {
    const grid = document.getElementById('gridServicios');
    grid.innerHTML = `
        <div class="tarjeta-servicio" id="tarjetaIndustrial"><div class="tarjeta-img" style="background-image: url('portada1.jpg');"></div><div class="tarjeta-info"><div class="tarjeta-titulo">Pedido Industrial <span>Mayorista</span></div><div class="tarjeta-desc">Minimo 2 cajas grandes por sabor. Descuento -12%.</div></div></div>
        <div class="tarjeta-servicio" id="tarjetaPersonal"><div class="tarjeta-img" style="background-image: url('portada1.jpg');"></div><div class="tarjeta-info"><div class="tarjeta-titulo">Pedido Personalizado <span>A medida</span></div><div class="tarjeta-desc">Elige la mezcla de 3 sabores y numero de cajas.</div></div></div>
    `;
    document.getElementById('tarjetaIndustrial').onclick = () => mostrarIndustrial();
    document.getElementById('tarjetaPersonal').onclick = () => mostrarPersonalizado();
}
function renderizarCarrusel() {
    const cont = document.getElementById('carruselItems');
    cont.innerHTML = `
        <div class="carrusel-card" id="carIndustrial"><img src="portada1.jpg"><div class="info"><h4>Pedido Industrial</h4><p>Volumen, desde 2 cajas/sabor</p></div></div>
        <div class="carrusel-card" id="carPersonal"><img src="portada1.jpg"><div class="info"><h4>Pedido Personalizado</h4><p>Crea tu propia caja</p></div></div>
    `;
    document.getElementById('carIndustrial').onclick = () => mostrarIndustrial();
    document.getElementById('carPersonal').onclick = () => mostrarPersonalizado();
}
function configurarFlechasCarrusel() {
    const wrapper = document.getElementById('carruselWrapper');
    const izq = document.getElementById('carruselIzq');
    const der = document.getElementById('carruselDer');
    if (!wrapper) return;
    let scroll = 0;
    const ancho = 300;
    const max = wrapper.scrollWidth - wrapper.clientWidth;
    izq.onclick = () => { scroll = Math.max(scroll - ancho, 0); wrapper.scrollTo({ left: scroll, behavior: 'smooth' }); };
    der.onclick = () => { scroll = Math.min(scroll + ancho, max); wrapper.scrollTo({ left: scroll, behavior: 'smooth' }); };
    wrapper.addEventListener('scroll', () => { scroll = wrapper.scrollLeft; });
}

    // tope 4 cajas grandes entre industrial + personalizado
    function totalCajasEnCarrito() {
    let total = 0;
    carrito.forEach(item => {
        if (item.tipo === 'industrial') {
            for (let id in item.detalles) {
                total += item.detalles[id];
            }
        } else if (item.tipo === 'personalizado') {
            total += item.cajas;
        }
    });
    return total;
}

    function mostrarIndustrial() {
    let q = {};
    todosSabores.forEach(s => q[s.id] = 0);
    cantidadesIndustrial = q;
    renderIndustrial();
}

function renderIndustrial() {
    const contenedor = document.getElementById('detalleContainer');
    let htmlSabores = '';
    todosSabores.forEach(sabor => {
        let val = cantidadesIndustrial[sabor.id] || 0;
        htmlSabores += `
            <div class="item-sabor">
                <div class="item-izquierda">
                    <img src="${sabor.img}" data-id="${sabor.id}" class="imgIndustrial">
                    <span data-id="${sabor.id}" class="nomIndustrial">${sabor.nombre}</span>
                </div>
                <input type="number" min="0" step="1" value="${val}" data-id="${sabor.id}" class="inputIndustrial"> <span>cajas grandes</span>
            </div>
        `;
    });
    contenedor.innerHTML = `
        <div class="volver" id="volverIndustrial"><i class="fas fa-arrow-left"></i> Volver a servicios</div>
        <h2>Pedido Industrial</h2>
        <div class="caja-personalizada">
            <p><strong>Condiciones:</strong> Cada caja grande = 48 cajitas = 768 bombones. Descuento <strong>-12%</strong> sobre precio bombon.<br>Minimo 2 cajas grandes por cada sabor que selecciones.<br>Total de cajas en este pedido no puede superar 4, y sumando lo que ya hay en carrito tampoco puede superar 4.</p>
            <div class="lista-sabores" id="listaIndustrial">${htmlSabores}</div>
            <div class="precio-estimado" id="previewIndustrial"></div>
            <button id="btnAgregarIndustrial" class="btn-agregar">Anadir al carrito</button>
        </div>
    `;
    document.querySelectorAll('.imgIndustrial, .nomIndustrial').forEach(el => {
        el.onclick = (e) => {
            const id = parseInt(el.dataset.id);
            const s = todosSabores.find(s => s.id === id);
            if (s) mostrarDetalleSabor(s);
        };
    });

    const inputs = document.querySelectorAll('.inputIndustrial');
    const actualizarPreview = () => {
        let totalCajas = 0;
        let precioTotal = 0;
        let desc = '';
        let haySeleccion = false;
        let invalido = false;
        inputs.forEach(inp => {
            let id = parseInt(inp.dataset.id);
            let cajas = parseInt(inp.value) || 0;
            if (cajas < 0) cajas = 0;
            cantidadesIndustrial[id] = cajas;
            if (cajas > 0) {
                haySeleccion = true;
                if (cajas < 2) invalido = true;
                totalCajas += cajas;
                let sabor = todosSabores.find(s => s.id === id);
                let precioDesc = sabor.precio * 0.88;
                let subtotal = precioDesc * 768 * cajas;
                precioTotal += subtotal;
                desc += `${sabor.nombre}: ${cajas} caja(s) - ${subtotal.toFixed(2)} €, `;
            }
        });
        let cajasActualesCarrito = totalCajasEnCarrito();
        let superaLimite = (cajasActualesCarrito + totalCajas) > 4;
        let mensajeExtra = '';
        if (superaLimite) mensajeExtra = ' (Supera el limite total de 4 cajas en el carrito)';
        if (invalido) {
            document.getElementById('previewIndustrial').innerHTML = `Atencion: Cada sabor elegido debe tener al menos 2 cajas. Precio estimado: ${precioTotal.toFixed(2)} €<br><small>${desc.slice(0,-2)}</small>`;
        } else {
            document.getElementById('previewIndustrial').innerHTML = `Precio estimado: ${precioTotal.toFixed(2)} € - Total cajas: ${totalCajas}${mensajeExtra}<br><small>${desc.slice(0,-2)}</small>`;
        }
        const btn = document.getElementById('btnAgregarIndustrial');
        if (btn) {
            let deshabilitado = (!haySeleccion || invalido || superaLimite);
            btn.disabled = deshabilitado;
            btn.style.opacity = deshabilitado ? '0.6' : '1';
        }
    };
    inputs.forEach(inp => {
        inp.oninput = actualizarPreview;
        inp.onblur = (e) => {
            let id = parseInt(inp.dataset.id);
            let val = parseInt(inp.value);
            if (!isNaN(val) && val > 0 && val < 2) {
                inp.value = 2;
                actualizarPreview();
            }
        };
    });
    actualizarPreview();

    document.getElementById('btnAgregarIndustrial').onclick = () => {
        let totalCajas = 0;
        for (let id in cantidadesIndustrial) totalCajas += cantidadesIndustrial[id];
        let cajasActualesCarrito = totalCajasEnCarrito();
        if (cajasActualesCarrito + totalCajas > 4) {
            mostrarFeedback('No se puede añadir este pedido porque supera el limite de 4 cajas grandes totales en el carrito.', 'error');
            return;
        }
        let alguno = false, valido = true;
        for (let id in cantidadesIndustrial) {
            let c = cantidadesIndustrial[id];
            if (c > 0) {
                alguno = true;
                if (c < 2) valido = false;
            }
        }
        if (!alguno) { mostrarFeedback('Selecciona al menos un sabor.', 'error'); return; }
        if (!valido) { mostrarFeedback('Cada sabor debe tener minimo 2 cajas grandes.', 'error'); return; }
        let total = 0, descripcion = '', detalles = {};
        for (let id in cantidadesIndustrial) {
            let c = cantidadesIndustrial[id];
            if (c > 0) {
                let s = todosSabores.find(s => s.id == id);
                let precioDesc = s.precio * 0.88;
                let sub = precioDesc * 768 * c;
                total += sub;
                descripcion += `${s.nombre} x${c} caja(s) `;
                detalles[s.nombre] = c;
            }
        }
        carrito.push({ tipo: 'industrial', total: total, descripcion: descripcion, cantidad: 1, detalles: detalles });
        guardarCarrito(); renderizarCarrito(); actualizarContador();
        mostrarFeedback('Pedido industrial añadido al carrito', 'success');
        publicarMqtt('tienda/carrito/industrial', { productos: detalles, total: total, resumen: descripcion });
        cambiarSeccion('cesta');
    };
    document.getElementById('volverIndustrial').onclick = () => cambiarSeccion('servicios');
    cambiarSeccion('detalle');
}

    function mostrarPersonalizado() {
    cajasGrandesPersonal = 1;
    let q = {};
    saboresPersonal.forEach(s => q[s.id] = 0);
    cantidadesPersonal = q;
    renderPersonalizado();
}
function renderPersonalizado() {
    const contenedor = document.getElementById('detalleContainer');
    let htmlSabores = '';
    saboresPersonal.forEach(sabor => {
        let val = cantidadesPersonal[sabor.id] || 0;
        htmlSabores += `
            <div class="item-sabor">
                <div class="item-izquierda">
                    <img src="${sabor.img}" data-id="${sabor.id}" class="imgPersonal">
                    <span data-id="${sabor.id}" class="nomPersonal">${sabor.nombre}</span>
                </div>
                <input type="number" min="0" step="1" value="${val}" data-id="${sabor.id}" class="inputPersonal"> <span>cajitas</span>
            </div>
        `;
    });
    contenedor.innerHTML = `
        <div class="volver" id="volverPersonal"><i class="fas fa-arrow-left"></i> Volver a servicios</div>
        <h2>Pedido Personalizado</h2>
        <div class="caja-personalizada">
            <p><strong>Capacidad:</strong> Cada caja grande contiene 48 cajitas (16 bombones/cajita).</p>
            <div><label>Numero de cajas grandes: </label><input type="number" id="numCajasGrandes" min="1" max="4" value="${cajasGrandesPersonal}" style="width:100px;"></div>
            <div class="lista-sabores" id="listaPersonal">${htmlSabores}</div>
            <div class="precio-estimado" id="previewPersonal"></div>
            <button id="btnAgregarPersonal" class="btn-agregar">Anadir al carrito</button>
        </div>
    `;

    document.querySelectorAll('.imgPersonal, .nomPersonal').forEach(el => {
        el.onclick = (e) => {
            const id = parseInt(el.dataset.id);
            const s = saboresPersonal.find(s => s.id === id);
            if (s) mostrarDetalleSabor(s);
        };
    });

    const inputCajas = document.getElementById('numCajasGrandes');
    const inputsCajitas = document.querySelectorAll('.inputPersonal');
    const actualizarPreviewPersonal = () => {
        let cajas = parseInt(inputCajas.value) || 1;
        if (cajas < 1) cajas = 1;
        if (cajas > 4) cajas = 4;
        inputCajas.value = cajas;
        cajasGrandesPersonal = cajas;
        let totalCajitasObj = cajas * 48;
        let sumaActual = 0;
        inputsCajitas.forEach(inp => {
            let val = parseInt(inp.value) || 0;
            let id = parseInt(inp.dataset.id);
            cantidadesPersonal[id] = val;
            sumaActual += val;
        });
        let diff = totalCajitasObj - sumaActual;
        let valido = (diff === 0);
        let totalPrecio = 0, desc = '';
        for (let id in cantidadesPersonal) {
            let cant = cantidadesPersonal[id];
            if (cant > 0) {
                let s = saboresPersonal.find(s => s.id == id);
                totalPrecio += s.precio * 16 * cant;
                desc += `${s.nombre}: ${cant} cajitas, `;
            }
        }
        let cajasActualesCarrito = totalCajasEnCarrito();
        let superaLimite = (cajasActualesCarrito + cajas) > 4;
        let mensajeExtra = superaLimite ? ' (Supera el limite total de 4 cajas)' : '';
        document.getElementById('previewPersonal').innerHTML = valido ?
            `Distribucion correcta (${sumaActual}/${totalCajitasObj}) - Total: ${totalPrecio.toFixed(2)} € - Cajas: ${cajas}${mensajeExtra}<br><small>${desc.slice(0,-2)}</small>` :
            `Debes sumar exactamente ${totalCajitasObj} cajitas. Faltan ${diff} cajitas.`;
        const btn = document.getElementById('btnAgregarPersonal');
        if (btn) btn.disabled = (!valido || superaLimite);
    };
    inputCajas.oninput = actualizarPreviewPersonal;
    inputsCajitas.forEach(inp => inp.oninput = actualizarPreviewPersonal);
    actualizarPreviewPersonal();

    document.getElementById('btnAgregarPersonal').onclick = () => {
        let cajas = cajasGrandesPersonal;
        let totalCajitas = cajas * 48;
        let suma = 0;
        for (let id in cantidadesPersonal) suma += cantidadesPersonal[id];
        if (suma !== totalCajitas) {
            mostrarFeedback(`La suma de cajitas debe ser ${totalCajitas}.`, 'error');
            return;
        }
        let cajasActualesCarrito = totalCajasEnCarrito();
        if (cajasActualesCarrito + cajas > 4) {
            mostrarFeedback('No se puede añadir este pedido porque supera el limite de 4 cajas grandes totales en el carrito.', 'error');
            return;
        }
        let totalPrecio = 0, desc = '', composicion = {};
        for (let id in cantidadesPersonal) {
            let cant = cantidadesPersonal[id];
            if (cant > 0) {
                let s = saboresPersonal.find(s => s.id == id);
                totalPrecio += s.precio * 16 * cant;
                desc += `${s.nombre}: ${cant} cajitas, `;
                composicion[s.nombre] = cant;
            }
        }
        carrito.push({ tipo: 'personalizado', total: totalPrecio, descripcion: `${cajas} caja(s) grande(s) - ${desc.slice(0,-2)}`, cantidad: 1, cajas: cajas, detalles: composicion });
        guardarCarrito(); renderizarCarrito(); actualizarContador();
        mostrarFeedback('Pedido personalizado anadido', 'success');
        publicarMqtt('tienda/carrito/personalizado', { cajasGrandes: cajas, composicion: composicion, total: totalPrecio });
        cambiarSeccion('cesta');
    };
    document.getElementById('volverPersonal').onclick = () => cambiarSeccion('servicios');
    cambiarSeccion('detalle');
}

    function enviarPedido(e) {
    e.preventDefault();
    if (carrito.length === 0) { mostrarFeedback('Anade algun pedido.', 'error'); return; }
    if (!datosCliente.cif) {
        mostrarFeedback('Primero completa tus datos en "Mi cuenta".', 'error');
        return;
    }
    if (datosCliente.tipo === 'autonomo') {
        migrarTarjetasLegacy();
        if (!datosCliente.tarjetas.length) {
            mostrarFeedback('Añade al menos una tarjeta en "Mi cuenta".', 'error');
            return;
        }
    }
    if (!validarDireccionesCliente()) {
        mostrarFeedback('Completa direcciones de envío y fiscal en "Mi cuenta".', 'error');
        return;
    }
    const idReparto = document.getElementById('empresaReparto').value;
    if (!idReparto) {
        mostrarFeedback('Selecciona una empresa de reparto.', 'error');
        return;
    }
    let total = carrito.reduce((acc, item) => acc + item.total, 0);
    const cliente = armarClienteMqtt();
    const pedidoData = {
        cliente: cliente,
        tipoCliente: cliente.tipo,
        idEmpresaReparto: parseInt(idReparto, 10),
        productos: carrito,
        total: total,
        nota: document.getElementById('notaPedido') ? document.getElementById('notaPedido').value : ''
    };
    publicarMqtt('tienda/pedido/nuevo', pedidoData);
    mostrarFeedback(`Pedido enviado (${cliente.tipo}). Total: ${total.toFixed(2)} €. Espera confirmacion MQTT...`, 'success');
    carrito = []; guardarCarrito(); renderizarCarrito(); actualizarContador();
}

    function cambiarSeccion(idSeccion) {
    document.querySelectorAll('.seccion').forEach(sec => sec.classList.remove('activa'));
    document.getElementById(`seccion-${idSeccion}`).classList.add('activa');
    document.querySelectorAll('.nav-link').forEach(btn => {
        if (btn.dataset.seccion === idSeccion) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    if (idSeccion === 'cesta') {
        mostrarResumenCliente();
    }
    setTimeout(() => document.getElementById(`seccion-${idSeccion}`).scrollIntoView({ behavior: 'smooth' }), 50);
}

    // listeners al cargar la página
    document.querySelectorAll('.nav-link').forEach(btn => btn.addEventListener('click', () => cambiarSeccion(btn.dataset.seccion)));
document.getElementById('inicioLink').onclick = (e) => { e.preventDefault(); cambiarSeccion('inicio'); };
document.getElementById('explorarBtn').onclick = () => cambiarSeccion('servicios');
document.getElementById('botonCarrito').onclick = () => cambiarSeccion('cesta');
document.getElementById('vaciarCarrito').onclick = vaciarCarrito;
document.getElementById('formPedido').addEventListener('submit', enviarPedido);
document.getElementById('conectarMqtt').onclick = conectarMqtt;
document.getElementById('formNewsletter').onsubmit = (e) => { e.preventDefault(); alert('Gracias por suscribirte'); e.target.reset(); };
document.getElementById('formContacto').onsubmit = (e) => { e.preventDefault(); alert('Mensaje enviado (demo). Te responderemos pronto.'); e.target.reset(); };
document.getElementById('footerIndustrial').onclick = (e) => { e.preventDefault(); mostrarIndustrial(); };
document.getElementById('footerPersonal').onclick = (e) => { e.preventDefault(); mostrarPersonalizado(); };
document.getElementById('footerContacto').onclick = (e) => { e.preventDefault(); cambiarSeccion('contacto'); };

renderizarServicios();
renderizarCarrusel();
configurarFlechasCarrusel();
cargarDatosCliente();
renderSelectEmpresasReparto();
renderizarCarrito();
actualizarContador();
cambiarSeccion('inicio');
setTimeout(() => conectarMqtt(), 1500);
