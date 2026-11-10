const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
// On Vercel, write to /tmp which is writable in serverless lambdas
const DATA_FILE = process.env.VERCEL 
  ? path.join('/tmp', 'syncplan_data.json') 
  : path.join(__dirname, 'data.json');

const INITIAL_DEMO_DATA = {
  plans: [
    {
      id: "plan_demo_fintech",
      slug: "fintech-corp-onboarding",
      clientName: "FinTech Corp",
      planTitle: "Enterprise ERP Integration & Card Rollout",
      targetDate: "2026-12-15",
      status: "active",
      clientContact: "Sarah Jenkins (Head of Finance)",
      vendorLead: "Alex Rivera (Founding Product Lead)",
      summary: "Onboarding blueprint to connect NetSuite, establish department spending limits, and issue 150 virtual cards.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      milestones: [
        {
          id: "m_1",
          title: "Phase 1: Compliance & Account Verification",
          dueDate: "2026-11-18",
          tasks: [
            { id: "t_1_1", title: "Submit KYB documents & authorized signatory IDs", owner: "client", status: "completed", notes: "Verified by compliance" },
            { id: "t_1_2", title: "Configure Okta SAML 2.0 Single Sign-On", owner: "client", status: "completed", notes: "SSO live" },
            { id: "t_1_3", title: "Provision Volopay production tenant & roles", owner: "vendor", status: "completed", notes: "Tenant provisioned" }
          ]
        },
        {
          id: "m_2",
          title: "Phase 2: Accounting & ERP Synchronization",
          dueDate: "2026-11-28",
          tasks: [
            { id: "t_2_1", title: "Connect NetSuite Sandbox and grant OAuth token", owner: "client", status: "pending", notes: "Awaiting IT credentials" },
            { id: "t_2_2", title: "Map General Ledger (GL) Codes & Tax rules", owner: "vendor", status: "pending", notes: "Mapped 48 categories" },
            { id: "t_2_3", title: "Run 2-way sync test with 10 dummy transactions", owner: "vendor", status: "pending", notes: "" }
          ]
        },
        {
          id: "m_3",
          title: "Phase 3: Card Controls & Employee Rollout",
          dueDate: "2026-12-15",
          tasks: [
            { id: "t_3_1", title: "Define multi-level manager approval thresholds", owner: "client", status: "pending", notes: "" },
            { id: "t_3_2", title: "Conduct 45-min live employee training session", owner: "vendor", status: "pending", notes: "Scheduled for Dec 10" },
            { id: "t_3_3", title: "Issue 150 physical & virtual cards for team leads", owner: "vendor", status: "pending", notes: "" }
          ]
        }
      ]
    }
  ]
};

// In-memory cache for ultra-fast serverless execution
let memoryCache = null;

function loadData() {
  if (memoryCache) return memoryCache;
  if (!fs.existsSync(DATA_FILE)) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_DEMO_DATA, null, 2));
    } catch (e) {}
    memoryCache = JSON.parse(JSON.stringify(INITIAL_DEMO_DATA));
    return memoryCache;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    memoryCache = JSON.parse(raw);
    return memoryCache;
  } catch (e) {
    memoryCache = JSON.parse(JSON.stringify(INITIAL_DEMO_DATA));
    return memoryCache;
  }
}

function saveData(data) {
  memoryCache = data;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {}
}

function calculateProgress(plan) {
  let total = 0;
  let completed = 0;
  if (!plan.milestones) return 0;
  for (const m of plan.milestones) {
    if (m.tasks) {
      for (const t of m.tasks) {
        total++;
        if (t.status === 'completed') completed++;
      }
    }
  }
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

// Main HTTP request handler (works for standalone node, Render, and Vercel serverless)
function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-matched-path');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Resolve true route even if rewritten by Vercel serverless (/api/index.js)
  const matchedPath = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'] || req.headers['x-rewrite-url'] || '';
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let pathname = parsedUrl.searchParams.get('path') || (req.query && req.query.path) || matchedPath || parsedUrl.pathname;

  // If Vercel passed /api/index.js or /api, resolve from path query, matchedPath, or infer default
  if (pathname === '/api/index.js' || pathname === '/api' || pathname === '/api/') {
    if (parsedUrl.searchParams.get('path')) {
      pathname = parsedUrl.searchParams.get('path');
    } else if (matchedPath) {
      pathname = matchedPath;
    } else {
      // Fallback: If POST with JSON body, treat as /api/plans; if GET, list plans
      pathname = '/api/plans';
    }
  }
  // Strip trailing slash except for root
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // Static file serving when running locally
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html' || pathname === '/admin')) {
    serveFile(res, path.join(__dirname, 'public', 'index.html'), 'text/html');
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/plan/')) {
    serveFile(res, path.join(__dirname, 'public', 'plan.html'), 'text/html');
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/public/')) {
    const relativePath = pathname.replace('/public/', '');
    serveFile(res, path.join(__dirname, 'public', relativePath));
    return;
  }

  // Health check endpoint for monitoring & uptime
  if (req.method === 'GET' && (pathname === '/api/health' || pathname === '/health')) {
    sendJson(res, 200, {
      status: 'healthy',
      zeroAiEngine: true,
      service: 'SyncPlan Claude MAP Platform',
      version: '1.2.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
    return;
  }

  // GET /api/plans
  if (req.method === 'GET' && (pathname === '/api/plans' || pathname === '/api/plans/')) {
    const data = loadData();
    const result = data.plans.map(p => ({
      ...p,
      progress: calculateProgress(p)
    }));
    sendJson(res, 200, { success: true, count: result.length, plans: result });
    return;
  }

  // GET /api/plans/:id
  if (req.method === 'GET' && pathname.startsWith('/api/plans/')) {
    const id = pathname.replace('/api/plans/', '');
    const data = loadData();
    const plan = data.plans.find(p => p.id === id || p.slug === id);
    if (!plan) {
      sendJson(res, 404, { success: false, error: 'Plan not found' });
      return;
    }
    sendJson(res, 200, { success: true, plan: { ...plan, progress: calculateProgress(plan) } });
    return;
  }

  // POST /api/plans
  if (req.method === 'POST' && (pathname === '/api/plans' || pathname === '/api/plans/')) {
    parseBody(req, (err, body) => {
      if (err || !body) return sendJson(res, 400, { success: false, error: 'Invalid JSON body' });

      const data = loadData();
      const id = 'plan_' + crypto.randomBytes(4).toString('hex');
      const slug = (body.clientName || 'client')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') + '-' + Math.floor(100 + Math.random() * 900);

      const newPlan = {
        id,
        slug,
        clientName: body.clientName || 'Unnamed Client',
        planTitle: body.planTitle || 'Client Onboarding Plan',
        targetDate: body.targetDate || '',
        status: body.status || 'active',
        clientContact: body.clientContact || '',
        vendorLead: body.vendorLead || 'Alex Rivera (Founder\'s Office Lead)',
        summary: body.summary || 'Custom onboarding roadmap generated via SyncPlan.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        milestones: Array.isArray(body.milestones) ? body.milestones.map((m, mIdx) => ({
          id: m.id || `m_${mIdx + 1}`,
          title: m.title || `Milestone ${mIdx + 1}`,
          dueDate: m.dueDate || '',
          tasks: Array.isArray(m.tasks) ? m.tasks.map((t, tIdx) => ({
            id: t.id || `t_${mIdx + 1}_${tIdx + 1}`,
            title: t.title || 'Task',
            owner: t.owner === 'client' ? 'client' : 'vendor',
            status: t.status === 'completed' ? 'completed' : 'pending',
            notes: t.notes || ''
          })) : []
        })) : []
      };

      data.plans.unshift(newPlan);
      saveData(data);

      sendJson(res, 201, {
        success: true,
        message: 'Plan created successfully',
        plan: { ...newPlan, progress: calculateProgress(newPlan) }
      });
    });
    return;
  }

  // POST /api/plans/:id/duplicate
  if (req.method === 'POST' && pathname.includes('/duplicate')) {
    const id = pathname.replace('/api/plans/', '').replace('/duplicate', '');
    const data = loadData();
    const original = data.plans.find(p => p.id === id || p.slug === id);
    if (!original) {
      return sendJson(res, 404, { success: false, error: 'Plan not found to duplicate' });
    }

    const newId = 'plan_' + crypto.randomBytes(4).toString('hex');
    const newSlug = original.slug.replace(/-\d+$/, '') + '-copy-' + Math.floor(100 + Math.random() * 900);
    const duplicated = {
      ...JSON.parse(JSON.stringify(original)),
      id: newId,
      slug: newSlug,
      clientName: `${original.clientName} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data.plans.unshift(duplicated);
    saveData(data);

    sendJson(res, 201, {
      success: true,
      message: 'Plan duplicated successfully',
      plan: { ...duplicated, progress: calculateProgress(duplicated) }
    });
    return;
  }

  // PUT /api/plans/:id
  if (req.method === 'PUT' && pathname.startsWith('/api/plans/')) {
    const id = pathname.replace('/api/plans/', '');
    parseBody(req, (err, body) => {
      if (err || !body) return sendJson(res, 400, { success: false, error: 'Invalid JSON body' });

      const data = loadData();
      const idx = data.plans.findIndex(p => p.id === id || p.slug === id);
      if (idx === -1) {
        return sendJson(res, 404, { success: false, error: 'Plan not found' });
      }

      const existing = data.plans[idx];
      const updated = {
        ...existing,
        ...body,
        id: existing.id,
        slug: existing.slug,
        updatedAt: new Date().toISOString()
      };

      data.plans[idx] = updated;
      saveData(data);

      sendJson(res, 200, {
        success: true,
        message: 'Plan updated successfully',
        plan: { ...updated, progress: calculateProgress(updated) }
      });
    });
    return;
  }

  // PATCH /api/plans/:id/tasks/:taskId
  if (req.method === 'PATCH' && pathname.includes('/tasks/')) {
    const parts = pathname.split('/');
    const planId = parts[3];
    const taskId = parts[5];

    parseBody(req, (err, body) => {
      const data = loadData();
      const plan = data.plans.find(p => p.id === planId || p.slug === planId);
      if (!plan) return sendJson(res, 404, { success: false, error: 'Plan not found' });

      let found = false;
      for (const m of plan.milestones) {
        if (!m.tasks) continue;
        for (const t of m.tasks) {
          if (t.id === taskId) {
            if (body && typeof body.status === 'string') {
              t.status = body.status;
            } else {
              t.status = t.status === 'completed' ? 'pending' : 'completed';
            }
            if (body && typeof body.notes === 'string') {
              t.notes = body.notes;
            }
            if (body && typeof body.title === 'string') {
              t.title = body.title;
            }
            if (body && typeof body.owner === 'string') {
              t.owner = body.owner;
            }
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) return sendJson(res, 404, { success: false, error: 'Task not found' });

      plan.updatedAt = new Date().toISOString();
      saveData(data);

      sendJson(res, 200, {
        success: true,
        message: 'Task updated',
        plan: { ...plan, progress: calculateProgress(plan) }
      });
    });
    return;
  }

  // DELETE /api/plans/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/plans/')) {
    const id = pathname.replace('/api/plans/', '');
    const data = loadData();
    const initialLen = data.plans.length;
    data.plans = data.plans.filter(p => p.id !== id && p.slug !== id);
    if (data.plans.length === initialLen) {
      return sendJson(res, 404, { success: false, error: 'Plan not found' });
    }
    saveData(data);
    sendJson(res, 200, { success: true, message: 'Plan deleted successfully' });
    return;
  }

  // MCP JSON-RPC 2.0 Handler
  if (req.method === 'POST' && (pathname === '/mcp' || pathname === '/api/mcp')) {
    parseBody(req, (err, rpcRequest) => {
      if (err || !rpcRequest) {
        return sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: invalid JSON payload' } });
      }
      handleMcpRpc(rpcRequest, req.headers.host, (rpcResponse) => {
        sendJson(res, 200, rpcResponse);
      });
    });
    return;
  }

  // MCP SSE Stream
  if (req.method === 'GET' && (pathname === '/sse' || pathname === '/api/sse')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    const endpointUrl = `https://${req.headers.host || 'localhost:3000'}/mcp`;
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);
    const interval = setInterval(() => { res.write(': ping\n\n'); }, 15000);
    req.on('close', () => { clearInterval(interval); });
    return;
  }

  sendJson(res, 404, { success: false, error: `Route '${pathname}' not found` });
}

function handleMcpRpc(rpc, host, callback) {
  if (!rpc || typeof rpc !== 'object') {
    return callback({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request: payload must be a JSON object' } });
  }

  const { method, params = {}, id = 1 } = rpc;
  const proto = host && host.includes('localhost') ? 'http' : 'https';
  const baseUrl = host ? `${proto}://${host}` : 'http://localhost:3000';

  if (method === 'initialize') {
    return callback({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, prompts: {}, resources: {} },
        serverInfo: { name: 'SyncPlan-MCP', version: '1.2.0' }
      }
    });
  }

  if (method === 'notifications/initialized') {
    return callback({ jsonrpc: '2.0', id, result: {} });
  }

  if (method === 'prompts/list') {
    return callback({
      jsonrpc: '2.0',
      id,
      result: {
        prompts: [
          {
            name: 'create_onboarding_plan',
            description: 'Takes kickoff meeting notes or sales handoff text and extracts a structured 4-phase Mutual Action Plan for customer onboarding.',
            arguments: [
              { name: 'clientName', description: 'Name of customer company', required: true },
              { name: 'kickoffNotes', description: 'Raw notes, transcripts, or objectives', required: true }
            ]
          }
        ]
      }
    });
  }

  if (method === 'tools/list') {
    return callback({
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'create_action_plan',
            description: 'Creates a live Mutual Action Plan (MAP) / Client Onboarding Portal from customer meeting notes or requirements. Returns a shareable live portal URL.',
            inputSchema: {
              type: 'object',
              properties: {
                clientName: { type: 'string', description: 'Name of the client company (e.g. Acme Corp)' },
                planTitle: { type: 'string', description: 'Title of the onboarding plan' },
                targetDate: { type: 'string', description: 'Target completion date (YYYY-MM-DD)' },
                clientContact: { type: 'string', description: 'Primary client contact name & email' },
                vendorLead: { type: 'string', description: 'Vendor account lead' },
                summary: { type: 'string', description: 'Summary of onboarding scope and goals' },
                milestones: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      dueDate: { type: 'string' },
                      tasks: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            title: { type: 'string' },
                            owner: { type: 'string', enum: ['client', 'vendor'] },
                            notes: { type: 'string' }
                          },
                          required: ['title', 'owner']
                        }
                      }
                    },
                    required: ['title', 'tasks']
                  }
                }
              },
              required: ['clientName', 'planTitle', 'milestones']
            }
          },
          {
            name: 'list_active_plans',
            description: 'Lists all active customer onboarding plans, client names, and completion percentages.',
            inputSchema: { type: 'object', properties: {} }
          },
          {
            name: 'get_plan_details',
            description: 'Fetches real-time status and tasks for a specific plan.',
            inputSchema: {
              type: 'object',
              properties: { planId: { type: 'string', description: 'Plan ID or slug' } },
              required: ['planId']
            }
          },
          {
            name: 'update_plan_task',
            description: 'Updates task status (completed/pending) or notes within an active plan.',
            inputSchema: {
              type: 'object',
              properties: {
                planId: { type: 'string' },
                taskId: { type: 'string' },
                status: { type: 'string', enum: ['completed', 'pending'] },
                notes: { type: 'string' }
              },
              required: ['planId', 'taskId']
            }
          },
          {
            name: 'add_milestone',
            description: 'Appends a new milestone phase and tasks to an existing onboarding plan.',
            inputSchema: {
              type: 'object',
              properties: {
                planId: { type: 'string' },
                title: { type: 'string' },
                dueDate: { type: 'string' },
                tasks: { type: 'array' }
              },
              required: ['planId', 'title']
            }
          }
        ]
      }
    });
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {};
    const data = loadData();

    if (name === 'create_action_plan') {
      const planId = 'plan_' + crypto.randomBytes(4).toString('hex');
      const slug = (args.clientName || 'client')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') + '-' + Math.floor(100 + Math.random() * 900);

      const newPlan = {
        id: planId,
        slug,
        clientName: args.clientName || 'Unnamed Client',
        planTitle: args.planTitle || 'Client Onboarding Roadmap',
        targetDate: args.targetDate || '',
        status: 'active',
        clientContact: args.clientContact || '',
        vendorLead: args.vendorLead || 'Alex Rivera (Founder\'s Office Lead)',
        summary: args.summary || 'Customer onboarding blueprint generated via Claude MCP.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        milestones: Array.isArray(args.milestones) ? args.milestones.map((m, mIdx) => ({
          id: `m_${mIdx + 1}`,
          title: m.title || `Phase ${mIdx + 1}`,
          dueDate: m.dueDate || '',
          tasks: Array.isArray(m.tasks) ? m.tasks.map((t, tIdx) => ({
            id: `t_${mIdx + 1}_${tIdx + 1}`,
            title: t.title || 'Action item',
            owner: t.owner === 'client' ? 'client' : 'vendor',
            status: 'pending',
            notes: t.notes || ''
          })) : []
        })) : []
      };

      data.plans.unshift(newPlan);
      saveData(data);

      const liveUrl = `${baseUrl}/plan/${slug}`;
      const adminUrl = `${baseUrl}/admin`;

      return callback({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `✅ Action Plan Created Successfully!\n\n📋 **Client**: ${newPlan.clientName}\n🎯 **Project**: ${newPlan.planTitle}\n📅 **Target Go-Live**: ${newPlan.targetDate || 'Flexible'}\n\n🔗 **Live Client Portal URL**: ${liveUrl}\n🛠️ **Internal Admin Editor**: ${adminUrl}\n\n*The client portal is live on the internet. Stakeholders can track and check off onboarding items.*`
            }
          ]
        }
      });
    }

    if (name === 'list_active_plans') {
      const summaryList = data.plans.map(p => ({
        id: p.id,
        slug: p.slug,
        client: p.clientName,
        title: p.planTitle,
        progress: `${calculateProgress(p)}%`,
        liveUrl: `${baseUrl}/plan/${p.slug}`
      }));
      return callback({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(summaryList, null, 2) }]
        }
      });
    }

    if (name === 'get_plan_details') {
      const plan = data.plans.find(p => p.id === args.planId || p.slug === args.planId);
      if (!plan) {
        return callback({
          jsonrpc: '2.0',
          id,
          result: { isError: true, content: [{ type: 'text', text: `Plan '${args.planId}' not found.` }] }
        });
      }
      return callback({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ ...plan, progress: `${calculateProgress(plan)}%`, liveUrl: `${baseUrl}/plan/${plan.slug}` }, null, 2) }]
        }
      });
    }

    if (name === 'update_plan_task') {
      const plan = data.plans.find(p => p.id === args.planId || p.slug === args.planId);
      if (!plan) {
        return callback({
          jsonrpc: '2.0',
          id,
          result: { isError: true, content: [{ type: 'text', text: `Plan '${args.planId}' not found.` }] }
        });
      }

      let found = false;
      for (const m of plan.milestones) {
        if (!m.tasks) continue;
        for (const t of m.tasks) {
          if (t.id === args.taskId) {
            if (args.status) t.status = args.status;
            if (args.notes) t.notes = args.notes;
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) {
        return callback({
          jsonrpc: '2.0',
          id,
          result: { isError: true, content: [{ type: 'text', text: `Task '${args.taskId}' not found in plan '${args.planId}'.` }] }
        });
      }

      plan.updatedAt = new Date().toISOString();
      saveData(data);

      return callback({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Task '${args.taskId}' updated successfully. Progress is now ${calculateProgress(plan)}%.` }]
        }
      });
    }

    if (name === 'add_milestone') {
      const plan = data.plans.find(p => p.id === args.planId || p.slug === args.planId);
      if (!plan) {
        return callback({
          jsonrpc: '2.0',
          id,
          result: { isError: true, content: [{ type: 'text', text: `Plan '${args.planId}' not found.` }] }
        });
      }

      const mIdx = plan.milestones.length + 1;
      const newM = {
        id: `m_${Date.now()}`,
        title: args.title || `Phase ${mIdx}`,
        dueDate: args.dueDate || '',
        tasks: Array.isArray(args.tasks) ? args.tasks.map((t, tIdx) => ({
          id: `t_${mIdx}_${tIdx + 1}`,
          title: t.title || 'Task',
          owner: t.owner === 'client' ? 'client' : 'vendor',
          status: 'pending',
          notes: t.notes || ''
        })) : []
      };

      plan.milestones.push(newM);
      plan.updatedAt = new Date().toISOString();
      saveData(data);

      return callback({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Milestone '${newM.title}' added to plan. Live portal updated immediately.` }]
        }
      });
    }

    return callback({ jsonrpc: '2.0', id, error: { code: -32601, message: `Tool '${name}' not recognized` } });
  }

  return callback({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method '${method}' not found` } });
}

function parseBody(req, callback) {
  // If runtime (Vercel serverless / Express) has already parsed req.body
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') {
      return callback(null, req.body);
    }
    if (typeof req.body === 'string') {
      try {
        return callback(null, JSON.parse(req.body));
      } catch (e) {
        return callback(e, null);
      }
    }
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 2e6) req.connection.destroy();
  });
  req.on('end', () => {
    try {
      const parsed = body ? JSON.parse(body) : {};
      callback(null, parsed);
    } catch (e) {
      callback(e, null);
    }
  });
  req.on('error', (err) => {
    callback(err, null);
  });
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
    const mime = contentType || getMimeType(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  });
}

function getMimeType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') return 'text/html';
  if (ext === '.css') return 'text/css';
  if (ext === '.js') return 'application/javascript';
  if (ext === '.json') return 'application/json';
  if (ext === '.png') return 'image/png';
  if (ext === '.svg') return 'image/svg+xml';
  return 'text/plain';
}

function sendJson(res, statusCode, obj) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// If invoked as standalone server
if (require.main === module) {
  function startServer(portToTry) {
    const srv = http.createServer(handleRequest);
    srv.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        startServer(portToTry + 1);
      } else {
        console.error('Server error:', err);
      }
    });

    srv.listen(portToTry, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 SyncPlan Zero-AI Platform is LIVE!`);
      console.log(`• Admin Workspace & Editor : http://localhost:${portToTry}/admin`);
      console.log(`• Live Client Portal       : http://localhost:${portToTry}/plan/fintech-corp-onboarding`);
      console.log(`• MCP Remote SSE Endpoint  : http://localhost:${portToTry}/sse`);
      console.log(`======================================================\n`);
    });
  }
  startServer(Number(PORT));
}

module.exports = handleRequest;
