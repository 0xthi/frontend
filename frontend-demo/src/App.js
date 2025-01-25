import { useEffect, useRef } from 'react';
import Datafeed from './datafeed.js';

function App() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!window.TradingView) {
      console.error('TradingView library not loaded');
      return;
    }

    const widgetOptions = {
      symbol: 'Bitfinex:BTC/USD', // Default symbol pair
      interval: '1D',             // Default interval
      fullscreen: true,           // Displays the chart in fullscreen mode
      container: 'tv_chart_container',
      datafeed: Datafeed,
      library_path: '/charting_library/',
      disabled_features: ['use_localstorage_for_settings'],
      enabled_features: ['study_templates'],
      charts_storage_url: 'https://saveload.tradingview.com',
      charts_storage_api_version: '1.1',
      client_id: 'tradingview.com',
      user_id: 'public_user',
      theme: 'Light',
    };

    const tvWidget = new window.TradingView.widget(widgetOptions);
    window.tvWidget = tvWidget;

    return () => {
      if (window.tvWidget) {
        window.tvWidget.remove();
        window.tvWidget = null;
      }
    };
  }, []);

  return (
    <div 
      id="tv_chart_container" 
      ref={containerRef}
      style={{ height: '100vh' }} 
    />
  );
}

export default App;
