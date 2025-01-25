import io from 'socket.io-client';

const socket = io('wss://streamer.cryptocompare.com');
const channelToSubscription = new Map();

socket.on('connect', () => {
    console.log('[socket] Connected');
});

socket.on('disconnect', (reason) => {
    console.log('[socket] Disconnected:', reason);
});

socket.on('error', (error) => {
    console.log('[socket] Error:', error);
});

function getNextDailyBarTime(barTime) {
    const date = new Date(barTime * 1000);
    date.setDate(date.getDate() + 1);
    return date.getTime() / 1000;
}

socket.on('m', data => {
    console.log('[socket] Message:', data);
    const [eventTypeStr, exchange, fromSymbol, toSymbol, , , tradeTimeStr, , tradePriceStr] = data.split('~');

    if (parseInt(eventTypeStr) !== 0) {
        // Skip all non-trading events
        return;
    }
    const tradePrice = parseFloat(tradePriceStr);
    const tradeTime = parseInt(tradeTimeStr);
    const channelString = `0~${exchange}~${fromSymbol}~${toSymbol}`;
    const subscriptionItem = channelToSubscription.get(channelString);
    if (subscriptionItem === undefined) {
        return;
    }
    const lastDailyBar = subscriptionItem.lastDailyBar;
    const nextDailyBarTime = getNextDailyBarTime(lastDailyBar.time);

    let bar;
    if (tradeTime >= nextDailyBarTime) {
        bar = {
            time: nextDailyBarTime,
            open: tradePrice,
            high: tradePrice,
            low: tradePrice,
            close: tradePrice,
        };
        console.log('[socket] Generate new bar', bar);
    } else {
        bar = {
            ...lastDailyBar,
            high: Math.max(lastDailyBar.high, tradePrice),
            low: Math.min(lastDailyBar.low, tradePrice),
            close: tradePrice,
        };
        console.log('[socket] Update the latest bar by price', tradePrice);
    }
    subscriptionItem.lastDailyBar = bar;

    // Send data to every subscriber of that symbol
    subscriptionItem.handlers.forEach(handler => handler.callback(bar));
});

export function subscribeOnStream(symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback, lastDailyBar) {
    const parsedSymbol = parseFullSymbol(`${symbolInfo.exchange}:${symbolInfo.name}`);
    const channelString = `0~${parsedSymbol.exchange}~${parsedSymbol.fromSymbol}~${parsedSymbol.toSymbol}`;
    const handler = {
        id: subscriberUID,
        callback: onRealtimeCallback,
    };
    let subscriptionItem = channelToSubscription.get(channelString);
    if (subscriptionItem) {
        subscriptionItem.handlers.push(handler);
        return;
    }
    subscriptionItem = {
        subscriberUID,
        resolution,
        lastDailyBar,
        handlers: [handler],
    };
    channelToSubscription.set(channelString, subscriptionItem);
    console.log('[subscribeBars]: Subscribe to streaming. Channel:', channelString);
    socket.emit('SubAdd', { subs: [channelString] });
}

export function unsubscribeFromStream(subscriberUID) {
    for (const channelString of channelToSubscription.keys()) {
        const subscriptionItem = channelToSubscription.get(channelString);
        const handlerIndex = subscriptionItem.handlers.findIndex(handler => handler.id === subscriberUID);

        if (handlerIndex !== -1) {
            subscriptionItem.handlers.splice(handlerIndex, 1);

            if (subscriptionItem.handlers.length === 0) {
                console.log('[unsubscribeBars]: Unsubscribe from streaming. Channel:', channelString);
                socket.emit('SubRemove', { subs: [channelString] });
                channelToSubscription.delete(channelString);
                break;
            }
        }
    }
}

export function parseFullSymbol(fullSymbol) {
    const match = fullSymbol.match(/^(\w+):(\w+)\/(\w+)$/);
    if (!match) {
        return null;
    }
    return { exchange: match[1], fromSymbol: match[2], toSymbol: match[3] };
} 