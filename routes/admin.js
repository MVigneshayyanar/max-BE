const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const admin = require('firebase-admin');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

const prisma = new PrismaClient();
router.use(authMiddleware);
router.use(requireAdmin);

// ═══ MAINTENANCE ═════════════════════════════════
router.get('/maintenance', async (req, res) => {
  try {
    let settings = await prisma.maintenanceSettings.findUnique({ where: { id: 'global' } });
    if (!settings) {
      settings = await prisma.maintenanceSettings.create({
        data: { id: 'global', isUnderMaintenance: false, minAppVersion: '1.0.0', forceUpdate: false },
      });
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get maintenance settings' });
  }
});

router.put('/maintenance', async (req, res) => {
  try {
    const { isUnderMaintenance, minAppVersion, forceUpdate, message } = req.body;
    const settings = await prisma.maintenanceSettings.upsert({
      where: { id: 'global' },
      update: {
        ...(isUnderMaintenance !== undefined && { isUnderMaintenance }),
        ...(minAppVersion !== undefined && { minAppVersion }),
        ...(forceUpdate !== undefined && { forceUpdate }),
        ...(message !== undefined && { message }),
      },
      create: {
        id: 'global',
        isUnderMaintenance: isUnderMaintenance || false,
        minAppVersion: minAppVersion || '1.0.0',
        forceUpdate: forceUpdate || false,
        message,
      },
    });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update maintenance settings' });
  }
});

// ═══ KNOWLEDGE BASE ══════════════════════════════
router.get('/knowledge', async (req, res) => {
  try {
    const articles = await prisma.knowledge.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ articles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list articles' });
  }
});

router.post('/knowledge', async (req, res) => {
  try {
    const article = await prisma.knowledge.create({ data: req.body });
    res.status(201).json({ article });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create article' });
  }
});

router.put('/knowledge/:id', async (req, res) => {
  try {
    const { id: _, ...data } = req.body;
    const article = await prisma.knowledge.update({ where: { id: req.params.id }, data });
    res.json({ article });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update article' });
  }
});

router.delete('/knowledge/:id', async (req, res) => {
  try {
    await prisma.knowledge.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

// ═══ SUPPORT TICKETS ═════════════════════════════
router.get('/support', async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;
    const tickets = await prisma.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ tickets });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list tickets' });
  }
});

router.put('/support/:id', async (req, res) => {
  try {
    const { status, response } = req.body;
    const ticket = await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: { ...(status && { status }), ...(response && { response }) },
    });
    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// ═══ PUSH NOTIFICATIONS ═════════════════════════
router.post('/notify', async (req, res) => {
  try {
    const { title, body, topic, data } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body required' });
    }

    const message = {
      notification: { title, body },
      data: data || {},
      topic: topic || 'knowledge_updates',
    };

    const response = await admin.messaging().send(message);
    res.json({ success: true, messageId: response });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

module.exports = router;
