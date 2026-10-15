/* ==========================================================================
   MAGUM CREATOR STUDIO - CLIENTE API PARA COMUNICACIÓN CON EL BACKEND
   ========================================================================== */

const API_BASE_URL = (function determineApiBase() {
  // 1. Si el usuario configuró una URL personalizada de Railway
  const customUrl = localStorage.getItem('magum_backend_url');
  if (customUrl) return customUrl.replace(/\/+$/, '');

  // 2. Si el frontend es servido por el mismo servidor de Express (mismo origen)
  if (window.location.port === '5000' || window.location.port === '8080' || window.location.pathname.startsWith('/api')) {
    return '/api';
  }

  // 3. Si se ejecuta en producción (ej. Vercel u otro dominio web)
  if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://magumcreatorstudiopro-production.up.railway.app/api';
  }

  // 4. Si se ejecuta en Live Server local o file://, apuntar al backend local
  return 'http://localhost:5000/api';
})();

class MagumApiClient {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  getToken() {
    const rawSession = localStorage.getItem('magum_session');
    if (!rawSession) return null;
    try {
      const session = JSON.parse(rawSession);
      return session.token || null;
    } catch {
      return null;
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `Error ${response.status}: ${response.statusText}`);
      }

      return data;
    } catch (error) {
      console.warn(`[API] Fallo en ${endpoint}:`, error.message);
      throw error;
    }
  }

  // Autenticación
  async login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // Cuentas (Super Admin)
  async getAccounts() {
    return this.request('/accounts');
  }

  async createAccount(accountData) {
    return this.request('/accounts', {
      method: 'POST',
      body: JSON.stringify(accountData)
    });
  }

  async toggleAccountStatus(id) {
    return this.request(`/accounts/${id}/status`, {
      method: 'PATCH'
    });
  }

  async deleteAccount(id) {
    return this.request(`/accounts/${id}`, {
      method: 'DELETE'
    });
  }

  async impersonate(id) {
    return this.request(`/accounts/${id}/impersonate`, {
      method: 'POST'
    });
  }

  // CRM Contactos
  async getCrmContacts(params = {}) {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.append('search', params.search);
    if (params.segment) searchParams.append('segment', params.segment);
    const qs = searchParams.toString();
    return this.request(`/crm/contacts${qs ? '?' + qs : ''}`);
  }

  async createCrmContact(contactData) {
    return this.request('/crm/contacts', {
      method: 'POST',
      body: JSON.stringify(contactData)
    });
  }

  async updateCrmContact(id, contactData) {
    return this.request(`/crm/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(contactData)
    });
  }

  async deleteCrmContact(id) {
    return this.request(`/crm/contacts/${id}`, {
      method: 'DELETE'
    });
  }

  async bulkDeleteCrmContacts(ids) {
    return this.request('/crm/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
  }

  async restoreCrmContact(id) {
    return this.request(`/crm/contacts/${id}/restore`, {
      method: 'POST'
    });
  }

  async importCrmContacts(contacts) {
    return this.request('/crm/import', {
      method: 'POST',
      body: JSON.stringify({ contacts })
    });
  }

  async broadcastCrm(payload) {
    return this.request('/crm/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Profesionales / Equipo
  async getTeam() {
    return this.request('/team');
  }

  async createTeamMember(data) {
    return this.request('/team', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateTeamMember(id, data) {
    return this.request(`/team/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteTeamMember(id) {
    return this.request(`/team/${id}`, {
      method: 'DELETE'
    });
  }

  // Facturación
  async getBilling() {
    return this.request('/billing');
  }

  async createBilling(data) {
    return this.request('/billing', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateBilling(id, data) {
    return this.request(`/billing/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteBilling(id) {
    return this.request(`/billing/${id}`, {
      method: 'DELETE'
    });
  }

  // Administradores de la Plataforma
  async getAdmins() {
    return this.request('/accounts/admins/list');
  }

  async createAdmin(data) {
    return this.request('/accounts/admins', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteAdmin(id) {
    return this.request(`/accounts/admins/${id}`, {
      method: 'DELETE'
    });
  }
}

// Clases e instancias globales disponibles en todos los scripts del frontend
window.MagumApiClient = MagumApiClient;
window.MagumApi = new MagumApiClient();
