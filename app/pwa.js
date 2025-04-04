if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(function (registration) {
        console.log(
          'ServiceWorker registration successful with scope: ',
          registration.scope
        );
      })
      .catch(function (error) {
        console.log('ServiceWorker registration failed: ', error);
      });
  });
}

function updateOnlineStatus() {
  const offlineIndicator = document.createElement('div');
  offlineIndicator.id = 'offline-indicator';
  offlineIndicator.style.display = 'none';
  offlineIndicator.style.position = 'fixed';
  offlineIndicator.style.bottom = '10px';
  offlineIndicator.style.left = '10px';
  offlineIndicator.style.backgroundColor = '#eb5757';
  offlineIndicator.style.color = 'white';
  offlineIndicator.style.padding = '8px 12px';
  offlineIndicator.style.borderRadius = '8px';
  offlineIndicator.style.fontSize = '14px';
  offlineIndicator.style.zIndex = '1000';
  offlineIndicator.textContent = 'You are offline';

  document.body.appendChild(offlineIndicator);

  function updateIndicator() {
    if (navigator.onLine) {
      offlineIndicator.style.display = 'none';
    } else {
      offlineIndicator.style.display = 'block';
    }
  }

  window.addEventListener('online', updateIndicator);
  window.addEventListener('offline', updateIndicator);

  updateIndicator();
}

document.addEventListener('DOMContentLoaded', updateOnlineStatus);
