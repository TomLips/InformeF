const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

// Configuración
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Funciones de obtención de datos (las mismas que en el original)
async function obtenerIntradiaGBPJPY() {
    try {
        const ahora = new Date();
        const ayer = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
        
        const [precioAyer, precioHoy] = await Promise.all([
            axios.get(`https://api.frankfurter.app/${ayer.toISOString().slice(0, 10)}?from=GBP&to=JPY`),
            axios.get(`https://api.frankfurter.app/latest?from=GBP&to=JPY`)
        ]);
        
        return ((precioHoy.data.rates.JPY - precioAyer.data.rates.JPY) / precioAyer.data.rates.JPY) * 100;
    } catch (error) {
        console.error("Error en obtenerIntradiaGBPJPY:", error);
        return NaN;
    }
}

async function obtenerAcumulado(from, to, fechaInicio, fechaFin) {
    try {
        const [responseInicio, responseFin] = await Promise.all([
            axios.get(`https://api.frankfurter.app/${fechaInicio.toISOString().slice(0, 10)}?from=${from}&to=${to}`),
            axios.get(`https://api.frankfurter.app/${fechaFin.toISOString().slice(0, 10)}?from=${from}&to=${to}`)
        ]);

        return ((responseFin.data.rates[to] - responseInicio.data.rates[to]) / responseInicio.data.rates[to]) * 100;
    } catch (error) {
        console.error(`Error en obtenerAcumulado(${from}/${to}):`, error);
        return NaN;
    }
}

async function obtenerIntradiaBCHUSD() {
    try {
        const res = await axios.get('https://api.coingecko.com/api/v3/coins/bitcoin-cash/market_chart?vs_currency=usd&days=2');
        const precios = res.data.prices;
        
        const ahora = new Date().getTime();
        const hace24h = ahora - (24 * 60 * 60 * 1000);
        
        let precioAyer = precios[0][1];
        let precioHoy = precios[precios.length - 1][1];
        
        for (let i = 0; i < precios.length; i++) {
            if (Math.abs(precios[i][0] - hace24h) < (12 * 60 * 60 * 1000)) {
                precioAyer = precios[i][1];
                break;
            }
        }
        
        return ((precioHoy - precioAyer) / precioAyer) * 100;
    } catch (error) {
        console.error("Error en obtenerIntradiaBCHUSD:", error);
        return NaN;
    }
}

// Funciones auxiliares
function getClaseColor(valor) {
    return valor < 0 ? "valor-rojo" : "valor-verde";
}

function getComentarioVariable1(acumulado) {
    if (isNaN(acumulado)) return "Datos no disponibles";
    if (acumulado < 0) return "MALO para Bolsa y Bitcoin";
    if (acumulado > 0) return "BUENO para Bolsa y Bitcoin";
    return "Sin señal clara";
}

function formatoFechaCEST(date) {
    const opciones = {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'Europe/Madrid'
    };
    return date.toLocaleString('es-ES', opciones) + ' CEST';
}

// Ruta principal
app.get('/', async (req, res) => {
    try {
        const hoy = new Date();
        const año = hoy.getFullYear();
        const mes = hoy.getMonth() + 1;

        const fechaInicioMes = new Date(año, mes - 1, 1);
        const fechaInicio3Meses = new Date(año, mes - 4, 1);
        const fechaInicioAño = new Date(año, 0, 1);

        // Obtener todos los datos necesarios
        const [variable1Mes, variable1TresMeses, variable1Ano, intradiaGBPJPY, acumuladoGBPJPY, acumuladoUSDJPY, intradiaB] = await Promise.all([
            obtenerAcumulado('USD', 'JPY', fechaInicioMes, hoy),
            obtenerAcumulado('USD', 'JPY', fechaInicio3Meses, hoy),
            obtenerAcumulado('USD', 'JPY', fechaInicioAño, hoy),
            obtenerIntradiaGBPJPY(),
            obtenerAcumulado('GBP', 'JPY', fechaInicioAño, hoy),
            obtenerAcumulado('USD', 'JPY', fechaInicioAño, hoy),
            obtenerIntradiaBCHUSD()
        ]);

        const variables = [variable1Mes, variable1TresMeses, variable1Ano];
        const media = variables.reduce((a, b) => a + b, 0) / variables.length;
        
        // Calcular riesgos
        const riesgoBolsa = (isNaN(media) ? 0 : media) + (isNaN(intradiaGBPJPY) ? 0 : intradiaGBPJPY);
        
        let intradiaB_ajustado = intradiaB;
        if (!isNaN(intradiaB)) {
            if (intradiaB > 0) intradiaB_ajustado = intradiaB / 3;
            else if (intradiaB < 0) intradiaB_ajustado = intradiaB / 2;
        }
        
        const riesgoBitcoin = (isNaN(media) ? 0 : media) + (isNaN(intradiaB_ajustado) ? 0 : intradiaB_ajustado);
        const valorRefugioReal = -media;
        const valorRefugioMostrar = Math.abs(valorRefugioReal);
        const esRefugioPositivo = valorRefugioReal > 0;
        const claseColorRefugio = esRefugioPositivo ? "valor-verde" : "valor-rojo";
        
        // Riesgo Global
        const riesgoGlobal = Math.abs(((isNaN(acumuladoGBPJPY) ? 0 : acumuladoGBPJPY) + (isNaN(acumuladoUSDJPY) ? 0 : acumuladoUSDJPY)) * 10);
        
        let nivelRiesgo = "";
        let claseTexto = "";
        
        if (riesgoGlobal <= 35) {
            nivelRiesgo = "Riesgo bajo (óptimo)";
            claseTexto = "texto-riesgo-bajo";
        } else if (riesgoGlobal > 35 && riesgoGlobal < 69) {
            nivelRiesgo = "Riesgo alto (peligro)";
            claseTexto = "texto-riesgo-alto";
        } else if (riesgoGlobal >= 69 && riesgoGlobal < 84) {
            nivelRiesgo = "Riesgo Muy Alto (Alerta)";
            claseTexto = "texto-riesgo-muy-alto";
        } else {
            nivelRiesgo = "ALTO RIESGO (ALERTA MÁXIMA)";
            claseTexto = "texto-riesgo-maximo";
        }

        // Preparar datos para la vista
        const data = {
            fechaActualizacion: formatoFechaCEST(hoy),
            proximaActualizacion: formatoFechaCEST(new Date(hoy.getTime() + 2 * 60 * 60 * 1000)),
            variables: [
                { 
                    texto: 'Mes actual (cálculo de nuestro propio indicador):',
                    valor: variable1Mes,
                    id: 'mes-actual'
                },
                { 
                    texto: 'Últimos 3 meses (cálculo de nuestro propio indicador):',
                    valor: variable1TresMeses,
                    id: 'ultimos-3-meses'
                },
                { 
                    texto: 'Año actual/acumulado (cálculo de nuestro propio indicador):',
                    valor: variable1Ano,
                    id: 'ano-actual'
                }
            ],
            media: {
                valor: media,
                comentario: getComentarioVariable1(media)
            },
            riesgoBolsa: {
                valor: riesgoBolsa,
                intradia: intradiaGBPJPY
            },
            riesgoBitcoin: {
                valor: riesgoBitcoin,
                intradia: intradiaB
            },
            riesgoBonos: {
                valor: valorRefugioMostrar,
                claseColor: claseColorRefugio,
                esPositivo: esRefugioPositivo
            },
            riesgoGlobal: {
                valor: riesgoGlobal,
                nivel: nivelRiesgo,
                claseTexto: claseTexto
            }
        };

        res.render('index', { data });
        
    } catch (error) {
        console.error('Error al obtener datos:', error);
        res.render('index', { error: true });
    }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});