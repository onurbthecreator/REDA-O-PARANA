// ============================================
// CISMEPAR - Backend SEGURO E FORTIFICADO
// Node.js + Express + MongoDB
// ============================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const app = express();

// ============================================
// SEGURANÇA - HELMET
// ============================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ============================================
// RATE LIMITING   (trocar em producao pois o .env esta desenvolvimento ai e ilimitado)
// ============================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requisições por IP
  message: { erro: 'Muitas requisições. Tente novamente em 15 minutos.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 1000, // 1000 em dev, 5 em prod
  message: { erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

// Rate limiting APENAS em produção
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', limiter);
  app.use('/api/auth/login', authLimiter);
  console.log('🔒 Rate limiting ativado (produção)');
} else {
  console.log('⚠️  Rate limiting desativado (desenvolvimento)');
}

// ============================================
// CORS RESTRITIVO
// ============================================
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ============================================
// MIDDLEWARES
// ============================================
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// CONEXÃO MONGODB (SEM OPÇÕES DEPRECATED)
// ============================================
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cismepar')
.then(() => console.log('✅ MongoDB conectado'))
.catch(err => console.error('❌ Erro MongoDB:', err));

let gfs;
mongoose.connection.once('open', () => {
  gfs = new GridFSBucket(mongoose.connection.db, {
    bucketName: 'exames'
  });
  console.log('✅ GridFS inicializado');
});

// ============================================
// SCHEMAS MONGOOSE
// ============================================

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  senha: { type: String, required: true },
  nome: { type: String, required: true, trim: true },
  tipo: { type: String, enum: ['admin', 'empresa'], required: true },
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa' },
  ativo: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const EmpresaSchema = new mongoose.Schema({
  nome: { type: String, required: true, unique: true, trim: true },
  cnpj: { type: String, trim: true },
  telefone: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  endereco: { type: String, trim: true },
  ativo: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const CategoriaSchema = new mongoose.Schema({
  nome: { type: String, required: true, unique: true, trim: true },
  cor: { type: String, default: '#1976d2' },
  ativo: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const ExameSchema = new mongoose.Schema({
  paciente: { type: String, trim: true },
  categoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Categoria', required: true },
  mes: { type: String, required: true },
  ano: { type: Number, required: true },
  data: { type: Date, required: true },
  observacoes: { type: String, trim: true },
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dataEnvio: { type: Date, default: Date.now },
  arquivos: [{
    nomeOriginal: String,
    nomeArmazenado: String,
    tipo: String,
    tamanho: Number,
    gridfsId: mongoose.Schema.Types.ObjectId
  }],
  tipoUpload: { type: String, enum: ['individual', 'massivo'], default: 'individual' },
  lote: { type: String, trim: true },
  historico: [{
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    data: { type: Date, default: Date.now },
    acao: String
  }],
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Empresa = mongoose.model('Empresa', EmpresaSchema);
const Categoria = mongoose.model('Categoria', CategoriaSchema);
const Exame = mongoose.model('Exame', ExameSchema);

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO SEGURO
// ============================================
const verificarToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ erro: 'Não autenticado' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
};

const verificarAdmin = async (req, res, next) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' });
  }
  next();
};

// ============================================
// VALIDAÇÃO DE ARQUIVOS (MAGIC NUMBERS)
// ============================================
const validarArquivo = (buffer, mimetype) => {
  const magicNumbers = {
    'application/pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
    'image/jpeg': Buffer.from([0xFF, 0xD8, 0xFF]),
    'image/png': Buffer.from([0x89, 0x50, 0x4E, 0x47])
  };
  
  for (const [type, magic] of Object.entries(magicNumbers)) {
    if (buffer.slice(0, magic.length).equals(magic)) {
      return type === mimetype;
    }
  }
  
  return false;
};

// ============================================
// CONFIGURAÇÃO MULTER
// ============================================
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const tipos = /pdf|jpg|jpeg|png/;
    const extensao = tipos.test(path.extname(file.originalname).toLowerCase());
    const mimetype = tipos.test(file.mimetype);
    
    if (extensao && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  }
});

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    if (!email || !senha) {
      return res.status(400).json({ erro: 'Email e senha obrigatórios' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase().trim(), ativo: true }).populate('empresa');
    
    if (!user) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }
    
    const senhaValida = await bcrypt.compare(senha, user.senha);
    
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }
    
    const token = jwt.sign(
      { 
        id: user._id, 
        tipo: user.tipo,
        empresa: user.empresa?._id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      usuario: {
        id: user._id,
        email: user.email,
        nome: user.nome,
        tipo: user.tipo,
        empresa: user.empresa?.nome || 'CISMEPAR',
        empresaId: user.empresa?._id
      }
    });
    
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ erro: 'Erro no servidor' });
  }
});

// ============================================
// ROTAS DE EMPRESAS
// ============================================

app.get('/api/empresas', verificarToken, async (req, res) => {
  try {
    if (req.usuario.tipo === 'admin') {
      const empresas = await Empresa.find({ ativo: true });
      
      const empresasComContador = await Promise.all(
        empresas.map(async (empresa) => {
          const totalExames = await Exame.countDocuments({ empresa: empresa._id, ativo: true });
          return {
            id: empresa._id,
            nome: empresa.nome,
            totalExames
          };
        })
      );
      
      res.json(empresasComContador);
    } else {
      const empresa = await Empresa.findById(req.usuario.empresa);
      res.json([{
        id: empresa._id,
        nome: empresa.nome,
        totalExames: await Exame.countDocuments({ empresa: empresa._id, ativo: true })
      }]);
    }
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ erro: 'Erro ao buscar empresas' });
  }
});

// ============================================
// ROTAS DE CATEGORIAS
// ============================================

app.get('/api/categorias', verificarToken, async (req, res) => {
  try {
    const categorias = await Categoria.find({ ativo: true });
    res.json(categorias);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar categorias' });
  }
});

app.post('/api/categorias', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { nome, cor } = req.body;
    
    if (!nome || nome.trim().length === 0) {
      return res.status(400).json({ erro: 'Nome é obrigatório' });
    }
    
    const categoria = await Categoria.create({ nome: nome.trim(), cor: cor || '#1976d2' });
    res.status(201).json(categoria);
    
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ erro: 'Categoria já existe' });
    }
    res.status(500).json({ erro: 'Erro ao criar categoria' });
  }
});

app.delete('/api/categorias/:id', verificarToken, verificarAdmin, async (req, res) => {
  try {
    await Categoria.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ mensagem: 'Categoria removida' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover categoria' });
  }
});

// ============================================
// ROTAS DE EXAMES
// ============================================

app.get('/api/exames', verificarToken, async (req, res) => {
  try {
    const { categoria, mes, ano, empresa } = req.query;
    
    let filtro = { ativo: true };
    
    if (req.usuario.tipo !== 'admin') {
      filtro.empresa = req.usuario.empresa;
    } else if (empresa) {
      filtro.empresa = empresa;
    }
    
    if (categoria) filtro.categoria = categoria;
    if (mes) filtro.mes = mes;
    if (ano) filtro.ano = parseInt(ano);
    
    const exames = await Exame.find(filtro)
      .populate('categoria', 'nome cor')
      .populate('empresa', 'nome')
      .populate('enviadoPor', 'nome')
      .populate('historico.usuario', 'nome')
      .sort({ dataEnvio: -1 })
      .limit(500);
    
    res.json(exames);
    
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar exames' });
  }
});

app.post('/api/exames', verificarToken, upload.single('pdf'), async (req, res) => {
  try {
    const { paciente, categoria, mes, ano, data, observacoes } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ erro: 'Arquivo não enviado' });
    }
    
    // VALIDAÇÃO REAL DO ARQUIVO (MAGIC NUMBERS)
    if (!validarArquivo(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ erro: 'Arquivo inválido ou corrompido' });
    }
    
    const uploadStream = gfs.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype
    });
    
    uploadStream.end(req.file.buffer);
    
    await new Promise((resolve, reject) => {
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
    });
    
    const exame = await Exame.create({
      paciente: paciente?.trim(),
      categoria,
      mes,
      ano: parseInt(ano),
      data: new Date(data),
      observacoes: observacoes?.trim(),
      empresa: req.usuario.tipo === 'admin' ? req.body.empresa : req.usuario.empresa,
      enviadoPor: req.usuario.id,
      tipoUpload: 'individual',
      arquivos: [{
        nomeOriginal: req.file.originalname,
        nomeArmazenado: req.file.originalname,
        tipo: req.file.mimetype.includes('pdf') ? 'pdf' : 'imagem',
        tamanho: req.file.size,
        gridfsId: uploadStream.id
      }],
      historico: [{
        usuario: req.usuario.id,
        acao: 'Criou o exame'
      }]
    });
    
    await exame.populate(['categoria', 'empresa', 'enviadoPor']);
    
    res.status(201).json(exame);
    
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ erro: 'Erro ao criar exame' });
  }
});

app.post('/api/exames/massivo', verificarToken, upload.array('arquivos', 100), async (req, res) => {
  try {
    const { categoria, mes, ano, lote } = req.body;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
    }
    
    const examesCriados = [];
    
    for (const file of req.files) {
      // VALIDAÇÃO REAL
      if (!validarArquivo(file.buffer, file.mimetype)) {
        continue; // Pula arquivos inválidos
      }
      
      const uploadStream = gfs.openUploadStream(file.originalname, {
        contentType: file.mimetype
      });
      
      uploadStream.end(file.buffer);
      
      await new Promise((resolve, reject) => {
        uploadStream.on('finish', resolve);
        uploadStream.on('error', reject);
      });
      
      const exame = await Exame.create({
        paciente: lote ? `Lote: ${lote}` : 'Upload Massivo',
        categoria,
        mes,
        ano: parseInt(ano),
        data: new Date(),
        empresa: req.usuario.tipo === 'admin' ? req.body.empresa : req.usuario.empresa,
        enviadoPor: req.usuario.id,
        tipoUpload: 'massivo',
        lote: lote?.trim(),
        arquivos: [{
          nomeOriginal: file.originalname,
          nomeArmazenado: file.originalname,
          tipo: file.mimetype.includes('pdf') ? 'pdf' : 'imagem',
          tamanho: file.size,
          gridfsId: uploadStream.id
        }],
        historico: [{
          usuario: req.usuario.id,
          acao: 'Criou via upload massivo'
        }]
      });
      
      examesCriados.push(exame);
    }
    
    res.status(201).json({
      mensagem: `${examesCriados.length} exame(s) criado(s)`,
      exames: examesCriados
    });
    
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ erro: 'Erro no upload massivo' });
  }
});

app.put('/api/exames/:id', verificarToken, async (req, res) => {
  try {
    const exame = await Exame.findById(req.params.id);
    
    if (!exame) {
      return res.status(404).json({ erro: 'Exame não encontrado' });
    }
    
    // VALIDAÇÃO DE PERMISSÃO
    if (req.usuario.tipo !== 'admin' && exame.empresa.toString() !== req.usuario.empresa.toString()) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
    
    const { paciente, categoria, mes, ano, data, observacoes } = req.body;
    
    exame.historico.push({
      usuario: req.usuario.id,
      acao: 'Editou o exame'
    });
    
    if (paciente) exame.paciente = paciente.trim();
    if (categoria) exame.categoria = categoria;
    if (mes) exame.mes = mes;
    if (ano) exame.ano = parseInt(ano);
    if (data) exame.data = new Date(data);
    if (observacoes !== undefined) exame.observacoes = observacoes.trim();
    
    await exame.save();
    await exame.populate(['categoria', 'empresa', 'enviadoPor', 'historico.usuario']);
    
    res.json(exame);
    
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao editar exame' });
  }
});

app.delete('/api/exames/:id', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const exame = await Exame.findByIdAndUpdate(
      req.params.id,
      { ativo: false },
      { new: true }
    );
    
    if (!exame) {
      return res.status(404).json({ erro: 'Exame não encontrado' });
    }
    
    res.json({ mensagem: 'Exame excluído' });
    
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir exame' });
  }
});

app.get('/api/exames/:id/arquivo/:arquivoId', async (req, res) => {
  try {
    // ✅ Aceita token no header OU na query string
    let token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      token = req.query.token; // Pega da URL: ?token=xxxxx
    }
    
    if (!token) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }
    
    // ✅ Valida o token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ erro: 'Token inválido' });
    }
    
    // ✅ Busca o exame
    const exame = await Exame.findById(req.params.id);
    
    if (!exame) {
      return res.status(404).json({ erro: 'Exame não encontrado' });
    }
    
    // ✅ VALIDAÇÃO DE PERMISSÃO
    if (decoded.tipo !== 'admin' && 
        exame.empresa.toString() !== decoded.empresa.toString()) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
    
    const arquivo = exame.arquivos.id(req.params.arquivoId);
    
    if (!arquivo) {
      return res.status(404).json({ erro: 'Arquivo não encontrado' });
    }
    
    const downloadStream = gfs.openDownloadStream(arquivo.gridfsId);
    
    res.set('Content-Type', arquivo.tipo === 'pdf' ? 'application/pdf' : 'image/jpeg');
    res.set('Content-Disposition', `inline; filename="${arquivo.nomeOriginal}"`);
    
    downloadStream.pipe(res);
    
  } catch (err) {
    console.error('Erro ao buscar arquivo:', err);
    res.status(500).json({ erro: 'Erro ao buscar arquivo' });
  }
});

// ============================================
// ROTAS ADMIN
// ============================================

app.post('/api/admin/criar-usuario', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { email, senha, nome, tipo, empresaId } = req.body;
    
    if (!email || !senha || !nome || !tipo) {
      return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
    }
    
    if (senha.length < 3) {
      return res.status(400).json({ erro: 'Senha deve ter no mínimo 3 caracteres' });
    }
    
    const usuarioExistente = await User.findOne({ email: email.toLowerCase().trim() });
    if (usuarioExistente) {
      return res.status(400).json({ erro: 'Email já cadastrado' });
    }
    
    const senhaHash = await bcrypt.hash(senha, 10);
    
    const novoUsuario = await User.create({
      email: email.toLowerCase().trim(),
      senha: senhaHash,
      nome: nome.trim(),
      tipo,
      empresa: tipo === 'empresa' ? empresaId : null
    });
    
    res.status(201).json({
      mensagem: 'Usuário criado',
      usuario: {
        id: novoUsuario._id,
        email: novoUsuario.email,
        nome: novoUsuario.nome,
        tipo: novoUsuario.tipo
      }
    });
    
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ erro: 'Erro ao criar usuário' });
  }
});

app.post('/api/admin/criar-empresa', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { nome, cnpj, telefone, email, endereco } = req.body;
    
    if (!nome || nome.trim().length === 0) {
      return res.status(400).json({ erro: 'Nome é obrigatório' });
    }
    
    const empresaExistente = await Empresa.findOne({ nome: nome.trim() });
    if (empresaExistente) {
      return res.status(400).json({ erro: 'Empresa já cadastrada' });
    }
    
    const empresa = await Empresa.create({ 
      nome: nome.trim(), 
      cnpj: cnpj?.trim(), 
      telefone: telefone?.trim(), 
      email: email?.toLowerCase().trim(), 
      endereco: endereco?.trim() 
    });
    
    res.status(201).json({
      mensagem: 'Empresa criada',
      empresa: {
        id: empresa._id,
        nome: empresa.nome
      }
    });
    
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({ erro: 'Erro ao criar empresa' });
  }
});

app.get('/api/admin/usuarios', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const usuarios = await User.find({ ativo: true })
      .populate('empresa', 'nome')
      .select('-senha');
    
    res.json(usuarios);
    
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao listar usuários' });
  }
});

app.post('/api/admin/trocar-senha', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { usuarioId, novaSenha } = req.body;
    
    if (!usuarioId || !novaSenha) {
      return res.status(400).json({ erro: 'Dados incompletos' });
    }
    
    if (novaSenha.length < 3) {
      return res.status(400).json({ erro: 'Senha deve ter no mínimo 3 caracteres' });
    }
    
    const senhaHash = await bcrypt.hash(novaSenha, 10);
    
    await User.findByIdAndUpdate(usuarioId, { senha: senhaHash });
    
    res.json({ mensagem: 'Senha alterada' });
    
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao trocar senha' });
  }
});

app.delete('/api/admin/usuarios/:id', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const usuario = await User.findById(req.params.id);
    
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }
    
    // PROTEÇÃO: NÃO PODE EXCLUIR ÚLTIMO ADMIN
    if (usuario.tipo === 'admin') {
      const totalAdmins = await User.countDocuments({ tipo: 'admin', ativo: true });
      
      if (totalAdmins <= 1) {
        return res.status(400).json({ erro: 'Não é possível excluir o único administrador ativo' });
      }
    }
    
    await User.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ mensagem: 'Usuário desativado' });
    
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir usuário' });
  }
});

// ============================================
// SEED
// ============================================
app.post('/api/seed', async (req, res) => {
  try {
    await User.deleteMany({});
    await Empresa.deleteMany({});
    await Categoria.deleteMany({});
    await Exame.deleteMany({});
    
    const empresas = await Empresa.insertMany([
      { nome: 'Clínica X', cnpj: '12.345.678/0001-00' },
      { nome: 'Lab Saúde', cnpj: '98.765.432/0001-00' },
      { nome: 'Hospital Central', cnpj: '11.222.333/0001-00' }
    ]);
    
    await Categoria.insertMany([
      { nome: 'USG Mamas', cor: '#e91e63' },
      { nome: 'USG Articulação', cor: '#2196f3' },
      { nome: 'USG Tireoide', cor: '#4caf50' },
      { nome: 'Raio-X', cor: '#ff9800' },
      { nome: 'Tomografia', cor: '#9c27b0' },
      { nome: 'Ressonância', cor: '#00bcd4' }
    ]);
    
    const senhaHash = await bcrypt.hash('123', 10);
    
    await User.insertMany([
      {
        email: 'admin@cismepar.com',
        senha: senhaHash,
        nome: 'Administrador CISMEPAR',
        tipo: 'admin'
      },
      {
        email: 'user@clinicax.com',
        senha: senhaHash,
        nome: 'Maria Silva',
        tipo: 'empresa',
        empresa: empresas[0]._id
      },
      {
        email: 'user@labsaude.com',
        senha: senhaHash,
        nome: 'João Santos',
        tipo: 'empresa',
        empresa: empresas[1]._id
      }
    ]);
    
    res.json({ mensagem: 'Dados iniciais criados!' });
    
  } catch (err) {
    console.error('Erro no seed:', err);
    res.status(500).json({ erro: 'Erro ao criar dados' });
  }
});

// ============================================
// INICIAR SERVIDOR
// ============================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`
✅ Servidor CISMEPAR SEGURO rodando na porta ${PORT}
📡 http://localhost:${PORT}
🔒 Helmet ativo
🚦 Rate limiting ativo
🍪 Cookies httpOnly prontos
🛡️  Validação de arquivos ativa

📝 Rotas disponíveis:
POST /api/auth/login
GET  /api/empresas
GET  /api/categorias
POST /api/categorias
GET  /api/exames
POST /api/exames
POST /api/exames/massivo
PUT  /api/exames/:id
DELETE /api/exames/:id
POST /api/admin/criar-usuario
POST /api/admin/criar-empresa
GET  /api/admin/usuarios
POST /api/admin/trocar-senha
DELETE /api/admin/usuarios/:id

🌱 Seed: POST /api/seed
  `);
});