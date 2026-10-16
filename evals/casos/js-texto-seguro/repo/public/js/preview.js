// Vista previa de la factura: muestra el nombre del cliente que llega en la URL.
const params = new URLSearchParams(window.location.search);
const customer = params.get('customer') || '';

document.getElementById('preview-customer').textContent = customer;
