const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mvgfc_support';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ============ SCHEMAS ============

const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  message: { type: String, required: true },
  isInternal: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const ticketSchema = new mongoose.Schema({
  ticketNumber: { type: String, unique: true, required: true },
  username: { type: String, required: true },
  email: { type: String },
  subject: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['New', 'Open', 'On Hold', 'Ongoing', 'Resolved', 'Closed Today'],
    default: 'New' 
  },
  assignedAgent: { type: String },
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

// Helper function to generate ticket number
function generateTicketNumber() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${timestamp}${random}`.slice(-5);
}

// ============ API ROUTES ============

// Get all tickets (Admin Dashboard)
app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .sort({ updatedAt: -1 })
      .lean();
    
    // Count tickets by status
    const stats = {
      open: tickets.filter(t => t.status === 'Open').length,
      new: tickets.filter(t => t.status === 'New').length,
      onHold: tickets.filter(t => t.status === 'On Hold').length,
      closedToday: tickets.filter(t => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return t.status === 'Closed Today' && new Date(t.updatedAt) >= today;
      }).length
    };

    res.json({ success: true, tickets, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single ticket with messages
app.get('/api/tickets/:ticketNumber', async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ 
      ticketNumber: req.params.ticketNumber 
    }).lean();

    if (!ticket) {
      return res.status(404).json({ 
        success: false, 
        error: 'Ticket not found' 
      });
    }

    res.json({ success: true, ticket });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new ticket (Customer submits)
app.post('/api/tickets', async (req, res) => {
  try {
    const { username, email, subject, message } = req.body;

    if (!username || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'Username, subject, and message are required'
      });
    }

    const ticketNumber = generateTicketNumber();

    const ticket = new Ticket({
      ticketNumber,
      username,
      email: email || '',
      subject,
      status: 'New',
      messages: [{
        sender: username,
        message,
        isInternal: false
      }]
    });

    await ticket.save();

    res.json({ 
      success: true, 
      ticket: {
        ticketNumber: ticket.ticketNumber,
        status: ticket.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add message to ticket
app.post('/api/tickets/:ticketNumber/messages', async (req, res) => {
  try {
    const { sender, message, isInternal } = req.body;

    if (!sender || !message) {
      return res.status(400).json({
        success: false,
        error: 'Sender and message are required'
      });
    }

    const ticket = await Ticket.findOne({ 
      ticketNumber: req.params.ticketNumber 
    });

    if (!ticket) {
      return res.status(404).json({ 
        success: false, 
        error: 'Ticket not found' 
      });
    }

    ticket.messages.push({
      sender,
      message,
      isInternal: isInternal || false
    });

    ticket.updatedAt = Date.now();
    await ticket.save();

    res.json({ success: true, ticket });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update ticket status (Admin)
app.patch('/api/tickets/:ticketNumber/status', async (req, res) => {
  try {
    const { status } = req.body;

    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      { status, updatedAt: Date.now() },
      { new: true }
    );

    if (!ticket) {
      return res.status(404).json({ 
        success: false, 
        error: 'Ticket not found' 
      });
    }

    res.json({ success: true, ticket });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign agent to ticket (Admin)
app.patch('/api/tickets/:ticketNumber/assign', async (req, res) => {
  try {
    const { agent } = req.body;

    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      { assignedAgent: agent, updatedAt: Date.now() },
      { new: true }
    );

    if (!ticket) {
      return res.status(404).json({ 
        success: false, 
        error: 'Ticket not found' 
      });
    }

    res.json({ success: true, ticket });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Close ticket (Admin)
app.patch('/api/tickets/:ticketNumber/close', async (req, res) => {
  try {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      { status: 'Closed Today', updatedAt: Date.now() },
      { new: true }
    );

    if (!ticket) {
      return res.status(404).json({ 
        success: false, 
        error: 'Ticket not found' 
      });
    }

    res.json({ success: true, ticket });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get notification count (new tickets)
app.get('/api/notifications', async (req, res) => {
  try {
    const newTicketsCount = await Ticket.countDocuments({ status: 'New' });
    res.json({ success: true, count: newTicketsCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`💬 Customer Portal: http://localhost:${PORT}/`);
  console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin.html`);
});