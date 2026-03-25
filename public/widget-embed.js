/**
 * MVGFC Chat Widget Embed Script
 * Add this script to any page to embed the chat widget
 */

(function() {
  // Configuration
  const WIDGET_URL = window.location.origin + '/widget.html'; // Update this to your widget URL
  
  // Create iframe container
  const widgetContainer = document.createElement('div');
  widgetContainer.id = 'mvgfc-chat-widget-container';
  widgetContainer.style.cssText = `
    position: fixed;
    bottom: 0;
    right: 0;
    z-index: 999999;
    border: none;
    margin: 0;
    padding: 0;
  `;
  
  // Create iframe
  const widgetIframe = document.createElement('iframe');
  widgetIframe.id = 'mvgfc-chat-widget-iframe';
  widgetIframe.src = WIDGET_URL;
  widgetIframe.style.cssText = `
    border: none;
    width: 100%;
    height: 100%;
    position: fixed;
    bottom: 0;
    right: 0;
    pointer-events: auto;
  `;
  widgetIframe.setAttribute('frameborder', '0');
  widgetIframe.setAttribute('allowtransparency', 'true');
  widgetIframe.setAttribute('scrolling', 'no');
  
  // Append iframe to container
  widgetContainer.appendChild(widgetIframe);
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      document.body.appendChild(widgetContainer);
    });
  } else {
    document.body.appendChild(widgetContainer);
  }
  
  // Optional: Expose API for parent window to control widget
  window.MVGFCChatWidget = {
    open: function() {
      widgetIframe.contentWindow.postMessage({ action: 'open' }, '*');
    },
    close: function() {
      widgetIframe.contentWindow.postMessage({ action: 'close' }, '*');
    },
    openTicket: function(ticketNumber) {
      widgetIframe.contentWindow.postMessage({ 
        action: 'openTicket', 
        ticketNumber: ticketNumber 
      }, '*');
    }
  };
})();