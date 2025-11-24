// ============================================
// CISMEPAR - Frontend JavaScript COMPLETO
// COM VISUALIZADOR INTEGRADO
// ============================================

const API_URL = CONFIG.API_URL;
let TOKEN = localStorage.getItem('cismepar_token');

let usuarioAtual = null;
let telaAtual = 'empresas';
let empresaSelecionada = null;
let categoriaSelecionada = null;
let exameEmEdicao = null;
let CATEGORIAS = [];
let arquivosMassivos = [];
let exameAtualPDF = null;
let isSubmitting = false;

// ==================== ELEMENTOS DOM ====================
const loginScreen = document.getElementById('loginScreen');
const app = document.getElementById('app');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

const btnBack = document.getElementById('btnBack');
const btnLogout = document.getElementById('btnLogout');
const btnUpload = document.getElementById('btnUpload');
const btnUploadMassivo = document.getElementById('btnUploadMassivo');
const btnAdmin = document.getElementById('btnAdmin');
const btnExportar = document.getElementById('btnExportar');
const breadcrumb = document.getElementById('breadcrumb');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userRole = document.getElementById('userRole');
const filterMes = document.getElementById('filterMes');

const empresasView = document.getElementById('empresasView');
const categoriasView = document.getElementById('categoriasView');
const examesView = document.getElementById('examesView');
const adminView = document.getElementById('adminView');
const emptyState = document.getElementById('emptyState');

const modalExame = document.getElementById('modalExame');
const modalMassivo = document.getElementById('modalMassivo');
const modalPDF = document.getElementById('modalPDF');
const formExame = document.getElementById('formExame');
const uploadArea = document.getElementById('uploadArea');
const examePDF = document.getElementById('examePDF');
const fileName = document.getElementById('fileName');

// ==================== LOADING OVERLAY ====================
function showLoading(message = 'Carregando...') {
  let loading = document.getElementById('loadingOverlay');
  if (!loading) {
    loading = document.createElement('div');
    loading.id = 'loadingOverlay';
    loading.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      flex-direction: column;
      gap: 16px;
    `;
    loading.innerHTML = `
      <div style="width: 48px; height: 48px; border: 4px solid #1976d2; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <p id="loadingText" style="color: white; font-size: 16px;">${message}</p>
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    `;
    document.body.appendChild(loading);
  } else {
    document.getElementById('loadingText').textContent = message;
    loading.style.display = 'flex';
  }
}

function hideLoading() {
  const loading = document.getElementById('loadingOverlay');
  if (loading) loading.style.display = 'none';
}

// ==================== LOGIN ====================
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const senha = document.getElementById('loginSenha').value;
  
  showLoading('Fazendo login...');
  
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.erro);
    }
    
    const data = await response.json();
    TOKEN = data.token;
    localStorage.setItem('cismepar_token', TOKEN);
    localStorage.setItem('cismepar_user', JSON.stringify(data.usuario));
    
    usuarioAtual = data.usuario;
    
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
    await inicializarApp();
    
  } catch (err) {
    loginError.textContent = `❌ ${err.message}`;
    loginError.classList.remove('hidden');
  } finally {
    hideLoading();
  }
});

btnLogout.addEventListener('click', () => {
  usuarioAtual = null;
  TOKEN = null;
  localStorage.removeItem('cismepar_token');
  localStorage.removeItem('cismepar_user');
  app.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  loginError.classList.add('hidden');
  loginForm.reset();
});

// ==================== INICIALIZAÇÃO ====================
async function inicializarApp() {
  userAvatar.textContent = usuarioAtual.nome.charAt(0);
  userName.textContent = usuarioAtual.nome;
  userRole.textContent = usuarioAtual.empresa;
  
  await carregarCategorias();
  
  if (usuarioAtual.tipo === 'admin') {
    btnAdmin.classList.remove('hidden');
    telaAtual = 'empresas';
    renderizarEmpresas();
  } else {
    telaAtual = 'categorias';
    renderizarCategorias();
  }
  
  atualizarInterface();
}

async function carregarCategorias() {
  try {
    const response = await fetch(`${API_URL}/categorias`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) throw new Error('Erro ao carregar categorias');
    
    CATEGORIAS = await response.json();
    
  } catch (err) {
    console.error('Erro ao carregar categorias:', err);
  }
}

// ==================== NAVEGAÇÃO ====================
btnBack.addEventListener('click', () => {
  if (telaAtual === 'exames') {
    telaAtual = 'categorias';
    categoriaSelecionada = null;
  } else if (telaAtual === 'categorias' && usuarioAtual.tipo === 'admin') {
    telaAtual = 'empresas';
    empresaSelecionada = null;
  } else if (telaAtual === 'admin') {
    telaAtual = usuarioAtual.tipo === 'admin' ? 'empresas' : 'categorias';
  }
  atualizarInterface();
});

btnAdmin.addEventListener('click', () => {
  telaAtual = 'admin';
  atualizarInterface();
});

function atualizarInterface() {
  empresasView.classList.add('hidden');
  categoriasView.classList.add('hidden');
  examesView.classList.add('hidden');
  adminView.classList.add('hidden');
  emptyState.classList.add('hidden');
  
  let bc = [];
  if (usuarioAtual.tipo === 'admin') bc.push('Empresas');
  else bc.push(usuarioAtual.empresa);
  
  if (empresaSelecionada && usuarioAtual.tipo === 'admin') bc.push(empresaSelecionada.nome);
  if (categoriaSelecionada) bc.push(categoriaSelecionada.nome);
  if (telaAtual === 'admin') bc = ['Administração'];
  
  breadcrumb.textContent = bc.join(' > ');
  
  if (telaAtual === 'empresas' && usuarioAtual.tipo === 'admin') {
    btnBack.classList.add('hidden');
  } else if (telaAtual === 'categorias' && usuarioAtual.tipo === 'empresa') {
    btnBack.classList.add('hidden');
  } else {
    btnBack.classList.remove('hidden');
  }
  
  if (usuarioAtual.tipo === 'empresa') {
    btnAdmin.classList.add('hidden');
  }
  
  if (telaAtual === 'categorias' || telaAtual === 'exames') {
    btnUpload.classList.remove('hidden');
    btnUploadMassivo.classList.remove('hidden');
  } else {
    btnUpload.classList.add('hidden');
    btnUploadMassivo.classList.add('hidden');
  }
  
  if (telaAtual === 'exames') {
    btnExportar.classList.remove('hidden');
    
    if (!document.getElementById('btnVerTodos')) {
      const btnVerTodos = document.createElement('button');
      btnVerTodos.id = 'btnVerTodos';
      btnVerTodos.className = 'btn-header';
      btnVerTodos.innerHTML = '👁️ Ver Todos';
      btnVerTodos.addEventListener('click', abrirTodosPDFs);
      btnExportar.parentElement.insertBefore(btnVerTodos, btnExportar);
    }
  } else {
    btnExportar.classList.add('hidden');
    const btnVerTodos = document.getElementById('btnVerTodos');
    if (btnVerTodos) btnVerTodos.remove();
  }
  
  switch (telaAtual) {
    case 'empresas':
      renderizarEmpresas();
      break;
    case 'categorias':
      renderizarCategorias();
      break;
    case 'exames':
      renderizarExames();
      break;
    case 'admin':
      renderizarAdmin();
      break;
  }
}

// ==================== BUSCA DE EMPRESAS ====================
let searchTimeout;
function buscarEmpresas(termo) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const cards = document.querySelectorAll('.empresa-card');
    const termoLower = termo.toLowerCase().trim();
    
    cards.forEach(card => {
      const nome = card.dataset.nome.toLowerCase();
      if (nome.includes(termoLower) || !termoLower) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }, 300);
}

// ==================== RENDERIZAÇÃO - EMPRESAS ====================
async function renderizarEmpresas() {
  const grid = document.getElementById('empresasGrid');
  grid.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Carregando...</p>';
  
  try {
    const response = await fetch(`${API_URL}/empresas`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) throw new Error('Erro ao carregar empresas');
    
    const empresas = await response.json();
    
    grid.innerHTML = `
      <div style="grid-column: 1/-1; margin-bottom: 16px;">
        <input 
          type="text" 
          id="searchEmpresas" 
          placeholder="🔍 Buscar empresa..." 
          style="width: 100%; max-width: 400px; padding: 12px; background: #1b1b1b; border: 1px solid #2a2a2a; border-radius: 8px; color: white; font-size: 14px;"
        >
      </div>
    `;
    
    empresas.forEach(empresa => {
      const card = document.createElement('div');
      card.className = 'empresa-card';
      card.dataset.nome = empresa.nome;
      card.innerHTML = `
        <div class="empresa-header">${empresa.nome.charAt(0)}</div>
        <div class="empresa-body">
          <div class="empresa-name">${empresa.nome}</div>
          <div class="empresa-info">${empresa.totalExames || 0} exames</div>
        </div>
      `;
      card.addEventListener('click', () => {
        empresaSelecionada = empresa;
        telaAtual = 'categorias';
        atualizarInterface();
      });
      grid.appendChild(card);
    });
    
    document.getElementById('searchEmpresas').addEventListener('input', (e) => {
      buscarEmpresas(e.target.value);
    });
    
    empresasView.classList.remove('hidden');
    
  } catch (err) {
    console.error('Erro ao carregar empresas:', err);
    grid.innerHTML = '<p style="color: #f44336; text-align: center; padding: 40px;">Erro ao carregar empresas</p>';
  }
}

// ==================== RENDERIZAÇÃO - CATEGORIAS ====================
async function renderizarCategorias() {
  const grid = document.getElementById('categoriasGrid');
  grid.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Carregando...</p>';
  
  try {
    const params = new URLSearchParams();
    
    if (filterMes.value) params.append('mes', filterMes.value);
    if (empresaSelecionada) params.append('empresa', empresaSelecionada.id);
    
    const response = await fetch(`${API_URL}/exames?${params}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) throw new Error('Erro ao carregar exames');
    
    const exames = await response.json();
    grid.innerHTML = '';
    
    CATEGORIAS.forEach(cat => {
      const examesDaCategoria = exames.filter(e => e.categoria._id === cat._id);
      
      const card = document.createElement('div');
      card.className = 'categoria-card';
      card.innerHTML = `
        <div class="categoria-header" style="background: ${cat.cor};">
          <span style="font-size: 40px;">📋</span>
        </div>
        <div class="categoria-body">
          <div class="categoria-name">${cat.nome}</div>
          <div class="categoria-count">${examesDaCategoria.length} exames</div>
        </div>
      `;
      card.addEventListener('click', () => {
        categoriaSelecionada = cat;
        telaAtual = 'exames';
        atualizarInterface();
      });
      grid.appendChild(card);
    });
    
    categoriasView.classList.remove('hidden');
    
  } catch (err) {
    console.error('Erro ao carregar categorias:', err);
    grid.innerHTML = '<p style="color: #f44336; text-align: center; padding: 40px;">Erro ao carregar categorias</p>';
  }
}

// ==================== RENDERIZAÇÃO - EXAMES ====================
async function renderizarExames() {
  const lista = document.getElementById('examesList');
  lista.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Carregando...</p>';
  
  try {
    const params = new URLSearchParams({
      categoria: categoriaSelecionada._id
    });
    
    if (filterMes.value) params.append('mes', filterMes.value);
    if (empresaSelecionada) params.append('empresa', empresaSelecionada.id);
    
    const response = await fetch(`${API_URL}/exames?${params}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) throw new Error('Erro ao carregar exames');
    
    const exames = await response.json();
    lista.innerHTML = '';
    
    if (exames.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      exames.forEach(exame => {
        const item = document.createElement('div');
        item.className = 'exame-item';
        
        const tipoIcone = exame.arquivos[0]?.tipo === 'pdf' ? 'PDF' : '🖼️';
        const corIcone = exame.arquivos[0]?.tipo === 'pdf' ? '#c62828' : '#1976d2';
        
        item.innerHTML = `
          <div class="exame-icon" style="background: ${corIcone};">${tipoIcone}</div>
          <div class="exame-info">
            <div class="exame-paciente">${exame.paciente}</div>
            <div class="exame-tipo">${exame.categoria.nome}</div>
            <div class="exame-meta">
              📅 ${new Date(exame.data).toLocaleDateString('pt-BR')} | 
              🏥 ${exame.empresa.nome} | 
              👤 ${exame.enviadoPor.nome}
              ${exame.tipoUpload === 'massivo' ? ' | 📦 Upload Massivo' : ''}
              ${exame.historico.length > 0 ? ` | ✏️ ${exame.historico.length} edições` : ''}
            </div>
          </div>
          <div class="exame-actions">
            <button class="btn-small btn-view" data-id="${exame._id}">📄 Ver</button>
            <button class="btn-small btn-edit" data-id="${exame._id}">✏️ Editar</button>
            ${usuarioAtual.tipo === 'admin' ? `<button class="btn-small btn-delete" data-id="${exame._id}">🗑️ Excluir</button>` : ''}
          </div>
        `;
        lista.appendChild(item);
      });
      
      lista.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', () => visualizarPDF(btn.dataset.id));
      });
      
      lista.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => editarExame(btn.dataset.id));
      });
      
      if (usuarioAtual.tipo === 'admin') {
        lista.querySelectorAll('.btn-delete').forEach(btn => {
          btn.addEventListener('click', () => excluirExame(btn.dataset.id));
        });
      }
    }
    
    examesView.classList.remove('hidden');
    
  } catch (err) {
    console.error('Erro ao carregar exames:', err);
    lista.innerHTML = '<p style="color: #f44336; text-align: center; padding: 40px;">Erro ao carregar exames</p>';
  }
}

// ==================== RENDERIZAÇÃO - ADMIN ====================
async function renderizarAdmin() {
  showLoading('Carregando painel admin...');
  
  try {
    const lista = document.getElementById('categoriasList');
    lista.innerHTML = '';
    
    CATEGORIAS.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'categoria-list-item';
      item.innerHTML = `
        <div class="categoria-list-name">${cat.nome}</div>
        <button class="btn-small btn-delete" data-id="${cat._id}">Remover</button>
      `;
      item.querySelector('button').addEventListener('click', () => removerCategoria(cat._id));
      lista.appendChild(item);
    });
    
    await carregarEmpresasSelect();
    await carregarUsuarios();
    
    adminView.classList.remove('hidden');
    
  } catch (err) {
    console.error('Erro ao renderizar admin:', err);
  } finally {
    hideLoading();
  }
}

async function carregarEmpresasSelect() {
  try {
    const response = await fetch(`${API_URL}/empresas`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) throw new Error('Erro ao carregar empresas');
    
    const empresas = await response.json();
    const select = document.getElementById('novoUsuarioEmpresa');
    select.innerHTML = empresas.map(e => 
      `<option value="${e.id}">${e.nome}</option>`
    ).join('');
    
  } catch (err) {
    console.error('Erro ao carregar empresas:', err);
  }
}

async function carregarUsuarios() {
  try {
    const response = await fetch(`${API_URL}/admin/usuarios`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) throw new Error('Erro ao carregar usuários');
    
    const usuarios = await response.json();
    const lista = document.getElementById('listaUsuarios');
    
    if (usuarios.length === 0) {
      lista.innerHTML = '<p style="color: #666; padding: 20px; text-align: center;">Nenhum usuário cadastrado</p>';
      return;
    }
    
    lista.innerHTML = usuarios.map(u => `
      <div class="categoria-list-item">
        <div>
          <div style="color: white; font-weight: 500;">${u.nome}</div>
          <div style="color: #aaa; font-size: 13px;">${u.email} • ${u.tipo === 'admin' ? '👑 Admin' : '🏢 ' + (u.empresa?.nome || 'Sem empresa')}</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-small" style="background: #ff9800; color: white;" onclick="abrirTrocarSenha('${u._id}', '${u.nome}')">🔑 Senha</button>
          <button class="btn-small btn-delete" onclick="excluirUsuario('${u._id}', '${u.nome}')">🗑️ Excluir</button>
        </div>
      </div>
    `).join('');
    
  } catch (err) {
    console.error('Erro ao carregar usuários:', err);
  }
}

function abrirTrocarSenha(usuarioId, usuarioNome) {
  document.getElementById('usuarioIdSenha').value = usuarioId;
  document.getElementById('usuarioNomeSenha').value = usuarioNome;
  document.getElementById('novaSenha').value = '';
  document.getElementById('confirmarSenha').value = '';
  document.getElementById('modalTrocarSenha').classList.remove('hidden');
}

document.getElementById('btnCancelarSenha').addEventListener('click', () => {
  document.getElementById('modalTrocarSenha').classList.add('hidden');
});

document.getElementById('formTrocarSenha').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const novaSenha = document.getElementById('novaSenha').value;
  const confirmarSenha = document.getElementById('confirmarSenha').value;
  
  if (novaSenha !== confirmarSenha) {
    alert('❌ As senhas não coincidem!');
    return;
  }
  
  if (novaSenha.length < 3) {
    alert('❌ Senha deve ter no mínimo 3 caracteres!');
    return;
  }
  
  showLoading('Alterando senha...');
  
  try {
    const response = await fetch(`${API_URL}/admin/trocar-senha`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        usuarioId: document.getElementById('usuarioIdSenha').value,
        novaSenha: novaSenha
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.erro);
    }
    
    document.getElementById('modalTrocarSenha').classList.add('hidden');
    showSuccessMessage('✅ Senha alterada com sucesso!');
    
  } catch (err) {
    console.error('Erro ao trocar senha:', err);
    alert(`❌ ${err.message}`);
  } finally {
    hideLoading();
  }
});

async function excluirUsuario(usuarioId, usuarioNome) {
  if (!confirm(`⚠️ Tem certeza que deseja excluir o usuário "${usuarioNome}"?\n\nEsta ação não pode ser desfeita!`)) {
    return;
  }
  
  showLoading('Excluindo usuário...');
  
  try {
    const response = await fetch(`${API_URL}/admin/usuarios/${usuarioId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.erro);
    }
    
    await carregarUsuarios();
    showSuccessMessage('✅ Usuário excluído com sucesso!');
    
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    alert(`❌ ${err.message}`);
  } finally {
    hideLoading();
  }
}

function showSuccessMessage(message) {
  const msgDiv = document.createElement('div');
  msgDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4caf50;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease;
  `;
  msgDiv.textContent = message;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(msgDiv);
  
  setTimeout(() => {
    msgDiv.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => msgDiv.remove(), 300);
  }, 3000);
}

document.getElementById('formNovaEmpresa').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  showLoading('Criando empresa...');
  
  try {
    const response = await fetch(`${API_URL}/admin/criar-empresa`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nome: document.getElementById('novaEmpresaNome').value,
        cnpj: document.getElementById('novaEmpresaCNPJ').value,
        telefone: document.getElementById('novaEmpresaTelefone').value,
        email: document.getElementById('novaEmpresaEmail').value,
        endereco: document.getElementById('novaEmpresaEndereco').value
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.erro);
    }
    
    document.getElementById('formNovaEmpresa').reset();
    await carregarEmpresasSelect();
    showSuccessMessage('✅ Empresa criada com sucesso!');
    
  } catch (err) {
    console.error('Erro ao criar empresa:', err);
    alert(`❌ ${err.message}`);
  } finally {
    hideLoading();
  }
});

document.getElementById('novoUsuarioTipo').addEventListener('change', (e) => {
  const selectEmpresa = document.getElementById('selectEmpresaUsuario');
  if (e.target.value === 'admin') {
    selectEmpresa.style.display = 'none';
  } else {
    selectEmpresa.style.display = 'block';
  }
});

document.getElementById('formNovoUsuario').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const tipo = document.getElementById('novoUsuarioTipo').value;
  const empresaId = tipo === 'empresa' ? document.getElementById('novoUsuarioEmpresa').value : null;
  
  showLoading('Criando usuário...');
  
  try {
    const response = await fetch(`${API_URL}/admin/criar-usuario`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nome: document.getElementById('novoUsuarioNome').value,
        email: document.getElementById('novoUsuarioEmail').value,
        senha: document.getElementById('novoUsuarioSenha').value,
        tipo: tipo,
        empresaId: empresaId
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.erro);
    }
    
    document.getElementById('formNovoUsuario').reset();
    await carregarUsuarios();
    showSuccessMessage('✅ Usuário criado com sucesso!');
    
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    alert(`❌ ${err.message}`);
  } finally {
    hideLoading();
  }
});

document.getElementById('btnAddCategoria').addEventListener('click', async () => {
  const input = document.getElementById('novaCategoriaInput');
  const nome = input.value.trim();
  
  if (!nome) return;
  
  showLoading('Criando categoria...');
  
  try {
    const response = await fetch(`${API_URL}/categorias`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ nome })
    });
    
    if (!response.ok) throw new Error('Erro ao criar categoria');
    
    input.value = '';
    await carregarCategorias();
    renderizarAdmin();
    
  } catch (err) {
    console.error('Erro ao criar categoria:', err);
    alert('❌ Erro ao criar categoria');
  } finally {
    hideLoading();
  }
});

async function removerCategoria(id) {
  if (!confirm('Deseja remover esta categoria?')) return;
  
  showLoading('Removendo...');
  
  try {
    const response = await fetch(`${API_URL}/categorias/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) throw new Error('Erro ao remover categoria');
    
    await carregarCategorias();
    renderizarAdmin();
    
  } catch (err) {
    console.error('Erro ao remover categoria:', err);
    alert('❌ Erro ao remover categoria');
  } finally {
    hideLoading();
  }
}

// ==================== MODAL EXAME ====================
btnUpload.addEventListener('click', () => {
  exameEmEdicao = null;
  arquivosMassivos = [];
  abrirModalExame();
});

function abrirModalExame(exame = null) {
  exameEmEdicao = exame;
  document.getElementById('modalTitle').textContent = exame ? 'Editar Exame' : 'Enviar Novo Exame';
  
  const select = document.getElementById('exameCategoria');
  select.innerHTML = CATEGORIAS.map(cat => 
    `<option value="${cat._id}">${cat.nome}</option>`
  ).join('');
  
  if (exame) {
    document.getElementById('examePaciente').value = exame.paciente;
    document.getElementById('exameCategoria').value = exame.categoria._id;
    document.getElementById('exameMes').value = exame.mes;
    document.getElementById('exameAno').value = exame.ano;
    document.getElementById('exameData').value = exame.data.split('T')[0];
    document.getElementById('exameObs').value = exame.observacoes || '';
    fileName.textContent = `📎 ${exame.arquivos[0]?.nomeOriginal}`;
    
    if (exame.historico.length > 0) {
      document.getElementById('historicoSection').classList.remove('hidden');
      const historicoList = document.getElementById('historicoList');
      historicoList.innerHTML = exame.historico.map(h => `
        <div class="historico-item">
          <span class="historico-user">${h.usuario?.nome || 'Usuário'}</span> ${h.acao} em ${new Date(h.data).toLocaleString('pt-BR')}
        </div>
      `).join('');
    } else {
      document.getElementById('historicoSection').classList.add('hidden');
    }
  } else {
    formExame.reset();
    fileName.textContent = '';
    examePDF.value = '';
    document.getElementById('exameAno').value = new Date().getFullYear();
    document.getElementById('historicoSection').classList.add('hidden');
    
    if (categoriaSelecionada) {
      document.getElementById('exameCategoria').value = categoriaSelecionada._id;
    }
  }
  
  modalExame.classList.remove('hidden');
}

uploadArea.addEventListener('click', () => examePDF.click());

examePDF.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    if (file.size > 10 * 1024 * 1024) {
      alert('Arquivo muito grande! Máximo: 10 MB');
      examePDF.value = '';
      return;
    }
    fileName.textContent = `📎 ${file.name}`;
  }
});

formExame.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (isSubmitting) return;
  isSubmitting = true;
  
  const formData = new FormData();
  formData.append('paciente', document.getElementById('examePaciente').value);
  formData.append('categoria', document.getElementById('exameCategoria').value);
  formData.append('mes', document.getElementById('exameMes').value);
  formData.append('ano', document.getElementById('exameAno').value);
  formData.append('data', document.getElementById('exameData').value);
  formData.append('observacoes', document.getElementById('exameObs').value);
  
  if (examePDF.files[0]) {
    formData.append('pdf', examePDF.files[0]);
  }
  
  if (usuarioAtual.tipo === 'admin' && empresaSelecionada) {
    formData.append('empresa', empresaSelecionada.id);
  }
  
  showLoading(exameEmEdicao ? 'Salvando...' : 'Enviando...');
  
  try {
    const url = exameEmEdicao 
      ? `${API_URL}/exames/${exameEmEdicao._id}`
      : `${API_URL}/exames`;
    
    const method = exameEmEdicao ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.erro);
    }
    
    modalExame.classList.add('hidden');
    atualizarInterface();
    
  } catch (err) {
    console.error('Erro ao salvar exame:', err);
    alert(`❌ Erro: ${err.message}`);
  } finally {
    hideLoading();
    isSubmitting = false;
  }
});

document.getElementById('btnCancelar').addEventListener('click', () => {
  modalExame.classList.add('hidden');
});

async function editarExame(id) {
  showLoading('Carregando exame...');
  
  try {
    const response = await fetch(`${API_URL}/exames?categoria=${categoriaSelecionada._id}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) throw new Error('Erro');
    
    const exames = await response.json();
    const exame = exames.find(e => e._id === id);
    
    if (exame) abrirModalExame(exame);
    
  } catch (err) {
    console.error('Erro ao carregar exame:', err);
  } finally {
    hideLoading();
  }
}

async function excluirExame(id) {
  if (!confirm('⚠️ Tem certeza que deseja excluir este exame?')) return;
  
  showLoading('Excluindo...');
  
  try {
    const response = await fetch(`${API_URL}/exames/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) throw new Error('Erro ao excluir');
    
    atualizarInterface();
    
  } catch (err) {
    console.error('Erro ao excluir exame:', err);
    alert(`❌ Erro: ${err.message}`);
  } finally {
    hideLoading();
  }
}

// ==================== UPLOAD MASSIVO ====================
btnUploadMassivo.addEventListener('click', () => {
  const selectMass = document.getElementById('massCategoria');
  selectMass.innerHTML = CATEGORIAS.map(cat => 
    `<option value="${cat._id}">${cat.nome}</option>`
  ).join('');
  
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const mesAtual = meses[new Date().getMonth()];
  document.getElementById('massMes').value = mesAtual;
  
  if (!arquivosMassivos || arquivosMassivos.length === 0) {
    arquivosMassivos = [];
    document.getElementById('arquivosSelecionados').innerHTML = '';
    document.getElementById('countArquivos').textContent = '0';
  } else {
    renderizarArquivosMassivos();
  }
  
  modalMassivo.classList.remove('hidden');
});

document.getElementById('uploadAreaMassivo').addEventListener('click', () => {
  document.getElementById('massPDFs').click();
});

document.getElementById('massPDFs').addEventListener('change', (e) => {
  const novosArquivos = Array.from(e.target.files);
  
  const arquivosValidos = novosArquivos.filter(arquivo => {
    if (arquivo.size > 50 * 1024 * 1024) {
      alert(`❌ Arquivo "${arquivo.name}" muito grande! Máximo: 50 MB`);
      return false;
    }
    return true;
  });
  
  arquivosMassivos = [...arquivosMassivos, ...arquivosValidos];
  renderizarArquivosMassivos();
});

function renderizarArquivosMassivos() {
  const btnEnviar = document.getElementById('btnEnviarMassivo');
  const countArquivos = document.getElementById('countArquivos');
  const arquivosSelecionados = document.getElementById('arquivosSelecionados');
  
  countArquivos.textContent = arquivosMassivos.length;
  
  if (arquivosMassivos.length === 0) {
    arquivosSelecionados.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">Nenhum arquivo selecionado</p>';
    btnEnviar.disabled = true;
    return;
  }

  btnEnviar.disabled = false;

  let totalTamanho = 0;
  arquivosSelecionados.innerHTML = arquivosMassivos.map((arquivo, index) => {
    const tamanho = (arquivo.size / 1024 / 1024).toFixed(2);
    totalTamanho += arquivo.size;
    const extensao = arquivo.name.split('.').pop().toLowerCase();
    const icone = ['jpg', 'jpeg', 'png'].includes(extensao) ? '🖼️' : 'PDF';
    const cor = ['jpg', 'jpeg', 'png'].includes(extensao) ? '#1976d2' : '#c62828';
    
    return `
      <div class="exame-item" style="margin-bottom: 8px;">
        <div class="exame-icon" style="background: ${cor};">${icone}</div>
        <div class="exame-info">
          <div class="exame-paciente">${arquivo.name}</div>
          <div class="exame-tipo">${tamanho} MB • ${extensao.toUpperCase()}</div>
        </div>
        <button class="btn-small btn-delete" data-index="${index}">❌ Remover</button>
      </div>
    `;
  }).join('');

  const totalMB = (totalTamanho / 1024 / 1024).toFixed(2);
  arquivosSelecionados.innerHTML += `
    <div style="background: #2a2a2a; padding: 12px; border-radius: 8px; margin-top: 12px; text-align: center;">
      <p style="color: #1976d2; font-size: 14px; font-weight: 500;">
        📊 Total: ${arquivosMassivos.length} arquivo(s) • ${totalMB} MB
      </p>
    </div>
  `;

  arquivosSelecionados.querySelectorAll('[data-index]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      arquivosMassivos.splice(index, 1);
      renderizarArquivosMassivos();
    });
  });
}

document.getElementById('btnCancelarMassivo').addEventListener('click', () => {
  modalMassivo.classList.add('hidden');
});

let isSubmittingMassivo = false;

document.getElementById('btnEnviarMassivo').addEventListener('click', async () => {
  if (arquivosMassivos.length === 0) {
    alert('❌ Selecione pelo menos um arquivo!');
    return;
  }
  
  if (isSubmittingMassivo) return;
  isSubmittingMassivo = true;
  
  const formData = new FormData();
  formData.append('categoria', document.getElementById('massCategoria').value);
  formData.append('mes', document.getElementById('massMes').value);
  formData.append('ano', document.getElementById('massAno').value);
  formData.append('lote', document.getElementById('massLote').value);
  
  if (usuarioAtual.tipo === 'admin' && empresaSelecionada) {
    formData.append('empresa', empresaSelecionada.id);
  }
  
  arquivosMassivos.forEach(arquivo => {
    formData.append('arquivos', arquivo);
  });
  
  showLoading(`Enviando ${arquivosMassivos.length} arquivo(s)...`);
  
  try {
    const response = await fetch(`${API_URL}/exames/massivo`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.erro);
    }
    
    modalMassivo.classList.add('hidden');
    arquivosMassivos = [];
    document.getElementById('massPDFs').value = '';
    atualizarInterface();
    
  } catch (err) {
    console.error('Erro no upload massivo:', err);
    alert(`❌ Erro: ${err.message}`);
  } finally {
    hideLoading();
    isSubmittingMassivo = false;
  }
});

// ==================== VISUALIZAR PDF (USA O VISUALIZADOR INTEGRADO) ====================
async function visualizarPDF(id) {
  abrirVisualizador(id);
}

document.getElementById('btnFecharPDF').addEventListener('click', () => {
  modalPDF.classList.add('hidden');
  document.getElementById('pdfFrame').src = '';
});

document.getElementById('btnBaixarPDF').addEventListener('click', () => {
  if (exameAtualPDF && exameAtualPDF.arquivos.length > 0) {
    const arquivoId = exameAtualPDF.arquivos[0]._id;
    const downloadUrl = `${API_URL}/exames/${exameAtualPDF._id}/arquivo/${arquivoId}?token=${TOKEN}`;
    window.open(downloadUrl, '_blank');
  }
});

// ==================== FILTROS ====================
filterMes.addEventListener('change', () => {
  atualizarInterface();
});

// ==================== EXPORTAÇÃO ====================
btnExportar.addEventListener('click', () => {
  const opcao = confirm('📥 Exportar:\n\nOK = Excel (lista)\nCancelar = ZIP (PDFs)');
  
  if (opcao) {
    exportarExcel();
  } else {
    alert('📦 Exportação em ZIP será implementada em breve');
  }
});

async function exportarExcel() {
  showLoading('Exportando...');
  
  try {
    const params = new URLSearchParams({
      categoria: categoriaSelecionada._id
    });
    
    if (filterMes.value) params.append('mes', filterMes.value);
    if (empresaSelecionada) params.append('empresa', empresaSelecionada.id);
    
    const response = await fetch(`${API_URL}/exames?${params}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) throw new Error('Erro ao buscar exames');
    
    const exames = await response.json();
    
    let csv = 'Paciente;Categoria;Mês;Ano;Data;Empresa;Enviado Por;Tipo Upload\n';
    exames.forEach(e => {
      csv += `${e.paciente};${e.categoria.nome};${e.mes};${e.ano};${new Date(e.data).toLocaleDateString('pt-BR')};${e.empresa.nome};${e.enviadoPor.nome};${e.tipoUpload}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `exames_${categoriaSelecionada.nome}_${Date.now()}.csv`;
    link.click();
    
  } catch (err) {
    console.error('Erro ao exportar:', err);
    alert('Erro ao exportar dados');
  } finally {
    hideLoading();
  }
}

// ==================== VER TODOS OS PDFs ====================
let examesParaAbrir = [];

async function abrirTodosPDFs() {
  showLoading('Carregando lista de exames...');
  
  try {
    const params = new URLSearchParams({
      categoria: categoriaSelecionada._id
    });
    
    if (filterMes.value) params.append('mes', filterMes.value);
    if (empresaSelecionada) params.append('empresa', empresaSelecionada.id);
    
    const response = await fetch(`${API_URL}/exames?${params}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) throw new Error('Erro ao carregar exames');
    
    const exames = await response.json();
    
    if (exames.length === 0) {
      alert('Nenhum exame para abrir');
      return;
    }
    
    examesParaAbrir = exames;
    document.getElementById('totalExamesAbrir').textContent = exames.length;
    document.getElementById('modalVerTodos').classList.remove('hidden');
    
  } catch (err) {
    console.error('Erro:', err);
    alert('Erro ao carregar exames');
  } finally {
    hideLoading();
  }
}

document.getElementById('btnCancelarTodos').addEventListener('click', () => {
  document.getElementById('modalVerTodos').classList.add('hidden');
});

document.getElementById('btnConfirmarTodos').addEventListener('click', () => {
  document.getElementById('modalVerTodos').classList.add('hidden');
  
  showLoading(`Abrindo ${examesParaAbrir.length} abas...`);
  
  let contador = 0;
  const intervalo = setInterval(() => {
    if (contador >= examesParaAbrir.length) {
      clearInterval(intervalo);
      hideLoading();
      showSuccessMessage(`✅ ${examesParaAbrir.length} abas abertas!`);
      return;
    }
    
    const exame = examesParaAbrir[contador];
    if (exame.arquivos.length > 0) {
      const arquivoId = exame.arquivos[0]._id;
      const pdfUrl = `${API_URL}/exames/${exame._id}/arquivo/${arquivoId}?token=${TOKEN}`;
      window.open(pdfUrl, '_blank');
    }
    
    contador++;
  }, 500);
});

// ==================== AUTO-LOGIN ====================
window.addEventListener('DOMContentLoaded', async () => {
  if (TOKEN) {
    try {
      const response = await fetch(`${API_URL}/categorias`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
      });
      
      if (response.ok) {
        const userData = JSON.parse(localStorage.getItem('cismepar_user') || '{}');
        if (userData.nome) {
          usuarioAtual = userData;
          loginScreen.classList.add('hidden');
          app.classList.remove('hidden');
          await inicializarApp();
        }
      } else {
        localStorage.removeItem('cismepar_token');
        localStorage.removeItem('cismepar_user');
        TOKEN = null;
      }
    } catch (err) {
      console.error('Erro ao verificar token:', err);
    }
  }
});