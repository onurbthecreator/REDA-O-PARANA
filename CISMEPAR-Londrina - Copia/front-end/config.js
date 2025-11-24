// ============================================
// CISMEPAR - Configuração do Frontend
// ============================================

// IMPORTANTE: Ao fazer deploy, mude esta URL para a URL do backend em produção
// Exemplo: https://cismepar-api.railway.app/api

const CONFIG = {
  // URL da API (backend)
  API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'  // Desenvolvimento
    : 'https://SEU-BACKEND-PRODUCAO.com/api',  // Produção (MUDE AQUI)
  
  // Timeout das requisições (em ms)
  TIMEOUT: 30000,
  
  // Tamanhos máximos de upload
  MAX_FILE_SIZE_INDIVIDUAL: 10 * 1024 * 1024, // 10 MB
  MAX_FILE_SIZE_MASSIVO: 50 * 1024 * 1024, // 50 MB
  
  // Tipos de arquivo permitidos
  ALLOWED_FILE_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
  ALLOWED_FILE_EXTENSIONS: ['.pdf', '.jpg', '.jpeg', '.png'],
  
  // Mensagens
  MESSAGES: {
    LOGIN_SUCCESS: '✅ Login realizado com sucesso!',
    LOGOUT_SUCCESS: '✅ Logout realizado com sucesso!',
    UPLOAD_SUCCESS: '✅ Upload realizado com sucesso!',
    EDIT_SUCCESS: '✅ Exame editado com sucesso!',
    DELETE_SUCCESS: '✅ Exame excluído com sucesso!',
    CREATE_SUCCESS: '✅ Criado com sucesso!',
    ERROR_GENERIC: '❌ Ocorreu um erro. Tente novamente.',
    ERROR_NETWORK: '❌ Erro de conexão. Verifique sua internet.',
    ERROR_AUTH: '❌ Sessão expirada. Faça login novamente.',
  }
};

// Exportar (se usar módulos ES6)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}