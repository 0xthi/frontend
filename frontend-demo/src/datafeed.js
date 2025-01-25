import { subscribeOnStream, unsubscribeFromStream, parseFullSymbol } from './streaming';

const lastBarsCache = new Map();

const configurationData = {
    supported_resolutions: ['1D', '1W', '1M'],
    exchanges: [
        { value: 'Bitfinex', name: 'Bitfinex', desc: 'Bitfinex' },
        { value: 'Kraken', name: 'Kraken', desc: 'Kraken bitcoin exchange' },
    ],
    symbols_types: [
        { name: 'crypto', value: 'crypto' },
    ],
};

async function makeApiRequest(path) {
    try {
        const response = await fetch(`https://min-api.cryptocompare.com/${path}`);
        return response.json();
    } catch (error) {
        throw new Error(`CryptoCompare request error: ${error.status}`);
    }
}

function generateSymbol(exchange, fromSymbol, toSymbol) {
    const short = `${fromSymbol}/${toSymbol}`;
    return {
        short,
        full: `${exchange}:${short}`,
    };
}

async function getAllSymbols() {
    const data = await makeApiRequest('data/v3/all/exchanges');
    let allSymbols = [];

    for (const exchange of configurationData.exchanges) {
        const pairs = data.Data[exchange.value].pairs;
        for (const leftPairPart of Object.keys(pairs)) {
            const symbols = pairs[leftPairPart].map(rightPairPart => {
                const symbol = generateSymbol(exchange.value, leftPairPart, rightPairPart);
                return {
                    symbol: symbol.short,
                    ticker: symbol.full,
                    description: symbol.short,
                    exchange: exchange.value,
                    type: 'crypto',
                };
            });
            allSymbols = [...allSymbols, ...symbols];
        }
    }
    return allSymbols;
}

export default {
    onReady: (callback) => {
        console.log('[onReady]: Method call');
        callback(configurationData);
    },

    searchSymbols: async (userInput, exchange, symbolType, onResultReadyCallback) => {
        console.log('[searchSymbols]: Method call');
        const symbols = await getAllSymbols();
        const newSymbols = symbols.filter(symbol => {
            const isExchangeValid = exchange === '' || symbol.exchange === exchange;
            const isFullSymbolContainsInput = symbol.ticker
                .toLowerCase()
                .indexOf(userInput.toLowerCase()) !== -1;
            return isExchangeValid && isFullSymbolContainsInput;
        });
        onResultReadyCallback(newSymbols);
    },

    resolveSymbol: async (symbolName, onSymbolResolvedCallback, onResolveErrorCallback) => {
        console.log('[resolveSymbol]: Method call', symbolName);
        const symbols = await getAllSymbols();
        const symbolItem = symbols.find(({ ticker }) => ticker === symbolName);
        if (!symbolItem) {
            console.log('[resolveSymbol]: Cannot resolve symbol', symbolName);
            onResolveErrorCallback('Cannot resolve symbol');
            return;
        }
        const symbolInfo = {
            ticker: symbolItem.ticker,
            name: symbolItem.symbol,
            description: symbolItem.description,
            type: symbolItem.type,
            session: '24x7',
            timezone: 'Etc/UTC',
            exchange: symbolItem.exchange,
            minmov: 1,
            pricescale: 100,
            has_intraday: false,
            visible_plots_set: 'ohlc',
            has_weekly_and_monthly: false,
            supported_resolutions: configurationData.supported_resolutions,
            volume_precision: 2,
            data_status: 'streaming',
        };
        console.log('[resolveSymbol]: Symbol resolved', symbolName);
        onSymbolResolvedCallback(symbolInfo);
    },

    getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
        console.log('[getBars]: Method call', symbolInfo);
        const { from, to, firstDataRequest } = periodParams;
        
        try {
            const fullSymbol = symbolInfo.full || `${symbolInfo.exchange}:${symbolInfo.name}`;
            const parsedSymbol = parseFullSymbol(fullSymbol);
            
            if (!parsedSymbol) {
                console.log('[getBars]: Symbol parsing failed');
                onErrorCallback('Symbol parsing failed');
                return;
            }

            const urlParameters = {
                fsym: parsedSymbol.fromSymbol,
                tsym: parsedSymbol.toSymbol,
                toTs: to,
                limit: 2000,
            };

            const query = Object.keys(urlParameters)
                .map(name => `${name}=${encodeURIComponent(urlParameters[name])}`)
                .join('&');

            const data = await makeApiRequest(`data/histoday?${query}`);
            
            if (!data.Data || data.Data.length === 0) {
                onHistoryCallback([], { noData: true });
                return;
            }

            const bars = data.Data.map(bar => ({
                time: bar.time * 1000,
                low: bar.low,
                high: bar.high,
                open: bar.open,
                close: bar.close,
                volume: bar.volumefrom
            }));

            if (firstDataRequest) {
                const symbolKey = `${symbolInfo.exchange}:${symbolInfo.name}`;
                lastBarsCache.set(symbolKey, { ...bars[bars.length - 1] });
            }

            console.log(`[getBars]: returned ${bars.length} bar(s)`);
            onHistoryCallback(bars, { noData: false });
        } catch (error) {
            console.log('[getBars]: Get error', error);
            onErrorCallback(error);
        }
    },

    subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback) => {
        console.log('[subscribeBars]: Method call with subscriberUID:', subscriberUID);
        subscribeOnStream(
            symbolInfo,
            resolution,
            onRealtimeCallback,
            subscriberUID,
            onResetCacheNeededCallback,
            lastBarsCache.get(`${symbolInfo.exchange}:${symbolInfo.name}`)
        );
    },

    unsubscribeBars: (subscriberUID) => {
        console.log('[unsubscribeBars]: Method call with subscriberUID:', subscriberUID);
        unsubscribeFromStream(subscriberUID);
    },
};