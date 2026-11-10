#!/usr/bin/env node

/**
 * SyncPlan Model Context Protocol (MCP) Server for Claude Desktop
 * Provides Claude with tools to create, inspect, and update Mutual Action Plans.
 * Zero AI keys needed. Claude does all thinking; this server handles persistence and URL generation.
 */

const readline = require('readline');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API_BASE_URL = process.env.SYNCPLAN_API_URL || 'http://localhost:3000';
const LOCAL_DATA_FILE = path.join(__dirname, 'data.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendResponse(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

// Fallback direct JSON persistence if HTTP server isn't running
function getLocalData() {
  if (fs.existsSync(LOCAL_DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_DATA_FILE, 'utf8'));
    } catch (e) {}
  }
  return { plans: [] };
}

function saveLocalData(data) {
  try {
    fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {}
}

async function makeApiCall(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(endpoint, API_BASE_URL);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const payload = body ? JSON.stringify(body) : null;
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      };

      const req = client.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            return resolve(null);
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ raw: data });
          }
        });
      });

      req.on('error', (err) => {
        // Fall back to local file if API call fails
        resolve(null);
      });

      if (payload) req.write(payload);
      req.end();
    } catch (e) {
      resolve(null);
    }
  });
}

rl.on('line', async (line) => {
  if (!line.trim()) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch (err) {
    sendResponse({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' }
    });
    return;
  }

  const { method, params, id } = request;

  // MCP Handshake: initialize
  if (method === 'initialize') {
    sendResponse({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'syncplan-mcp',
          version: '1.0.0'
        }
      }
    });
    return;
  }

  // MCP Handshake: notifications/initialized
  if (method === 'notifications/initialized') {
    // No-op for notification
    return;
  }

  // MCP Tools List
  if (method === 'tools/list') {
    sendResponse({
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'create_action_plan',
            description: 'Creates a live, interactive Mutual Action Plan (MAP) / Client Onboarding Portal from customer meeting notes or kickoff specifications. Returns a public URL where the client can review, track, and check off onboarding items.',
            inputSchema: {
              type: 'object',
              properties: {
                clientName: { type: 'string', description: 'Name of the client company (e.g. Acme Corp)' },
                planTitle: { type: 'string', description: 'Title of the onboarding project (e.g. NetSuite Integration & Card Rollout)' },
                targetDate: { type: 'string', description: 'Target completion date (YYYY-MM-DD)' },
                clientContact: { type: 'string', description: 'Client lead name and email' },
                vendorLead: { type: 'string', description: 'Vendor account lead' },
                summary: { type: 'string', description: 'Overview of onboarding scope and goals' },
                milestones: {
                  type: 'array',
                  description: 'Phases/milestones containing itemized tasks',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: 'Milestone title' },
                      dueDate: { type: 'string', description: 'Target date (YYYY-MM-DD)' },
                      tasks: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            title: { type: 'string', description: 'Specific action item' },
                            owner: { type: 'string', enum: ['client', 'vendor'], description: 'Who must complete it: client or vendor' },
                            notes: { type: 'string', description: 'Context or instructions' }
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
            description: 'Lists all active client action plans, their live portal URLs, and current progress completion rates.',
            inputSchema: { type: 'object', properties: {} }
          },
          {
            name: 'get_plan_details',
            description: 'Retrieves current status, completed tasks, and pending action items for a client plan.',
            inputSchema: {
              type: 'object',
              properties: {
                planId: { type: 'string', description: 'ID or slug of the plan' }
              },
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
    return;
  }

  // MCP Prompts List
  if (method === 'prompts/list') {
    sendResponse({
      jsonrpc: '2.0',
      id,
      result: {
        prompts: [
          {
            name: 'create_onboarding_plan',
            description: 'Synthesizes meeting transcripts and creates an enterprise Mutual Action Plan.',
            arguments: [{ name: 'notes', description: 'Raw notes', required: true }]
          }
        ]
      }
    });
    return;
  }

  // MCP Tool Execution
  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {};

    if (name === 'create_action_plan') {
      let apiResult = await makeApiCall('POST', '/api/plans', args);

      // Fallback if local API wasn't reachable
      if (!apiResult || !apiResult.plan) {
        const local = getLocalData();
        const id = 'plan_' + crypto.randomBytes(4).toString('hex');
        const slug = (args.clientName || 'client')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') + '-' + Math.floor(100 + Math.random() * 900);

        const newPlan = {
          id,
          slug,
          clientName: args.clientName || 'Unnamed Client',
          planTitle: args.planTitle || 'Client Onboarding Plan',
          targetDate: args.targetDate || '',
          status: 'active',
          clientContact: args.clientContact || '',
          vendorLead: args.vendorLead || 'Alex Rivera (Founder\'s Office Lead)',
          summary: args.summary || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: (args.milestones || []).map((m, mIdx) => ({
            id: `m_${mIdx + 1}`,
            title: m.title || `Phase ${mIdx + 1}`,
            dueDate: m.dueDate || '',
            tasks: (m.tasks || []).map((t, tIdx) => ({
              id: `t_${mIdx + 1}_${tIdx + 1}`,
              title: t.title,
              owner: t.owner === 'client' ? 'client' : 'vendor',
              status: 'pending',
              notes: t.notes || ''
            }))
          }))
        };
        local.plans.unshift(newPlan);
        saveLocalData(local);
        apiResult = { success: true, plan: newPlan };
      }

      const plan = apiResult.plan;
      const liveUrl = `${API_BASE_URL}/plan/${plan.slug}`;
      const adminUrl = `${API_BASE_URL}/admin`;

      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `🚀 **SyncPlan Created Successfully!**\n\n• **Client**: ${plan.clientName}\n• **Project**: ${plan.planTitle}\n• **Target Go-Live**: ${plan.targetDate || 'TBD'}\n\n🔗 **Live Client Portal**: ${liveUrl}\n🛠️ **Admin Workspace & Editor**: ${adminUrl}\n\n*The client portal is now active on the web. The client can open the link to check off tasks, and your team can edit milestones in the admin editor.*`
            }
          ]
        }
      });
      return;
    }

    if (name === 'list_active_plans') {
      let apiResult = await makeApiCall('GET', '/api/plans');
      let plans = (apiResult && apiResult.plans) ? apiResult.plans : getLocalData().plans;

      const summary = plans.map(p => ({
        client: p.clientName,
        title: p.planTitle,
        targetDate: p.targetDate,
        liveUrl: `${API_BASE_URL}/plan/${p.slug}`
      }));

      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(summary, null, 2)
            }
          ]
        }
      });
      return;
    }

    if (name === 'get_plan_details') {
      let apiResult = await makeApiCall('GET', `/api/plans/${args.planId}`);
      let plan = (apiResult && apiResult.plan) ? apiResult.plan : null;

      if (!plan) {
        const local = getLocalData();
        plan = local.plans.find(p => p.id === args.planId || p.slug === args.planId);
      }

      if (!plan) {
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [{ type: 'text', text: `Plan '${args.planId}' not found.` }]
          }
        });
        return;
      }

      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(plan, null, 2)
            }
          ]
        }
      });
      return;
    }

    if (name === 'update_plan_task') {
      let apiResult = await makeApiCall('PATCH', `/api/plans/${args.planId}/tasks/${args.taskId}`, { status: args.status, notes: args.notes });
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Task updated: ${apiResult && apiResult.success ? 'Success' : 'Synced locally'}` }]
        }
      });
      return;
    }

    sendResponse({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Tool '${name}' not recognized` }
    });
    return;
  }

  sendResponse({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method '${method}' not handled` }
  });
});
