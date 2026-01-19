const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { google } = require('googleapis');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mvgfc_support';

mongoose.connect(MONGODB_URI)
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
  category: { 
    type: String, 
    enum: ['Question', 'Complaint', 'Feedback'],
    required: true 
  },
  username: { type: String, required: true },
  email: { type: String },
  subject: { type: String, required: true },
  subjectCategory: { type: String },
  status: { 
  type: String, 
  enum: ['New', 'Open', 'On Hold', 'Ongoing', 'In Progress', 'in-progress', 'Resolved', 'Closed Today'],
  default: 'New' }
  assignedAgent: { type: String },
  messages: [messageSchema],
  isArchived: { type: Boolean, default: false },
  archivedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

// ============ GOOGLE SHEETS INTEGRATION ============

async function logToGoogleSheet(ticketData) {
  try {
    if (!process.env.GOOGLE_SHEETS_CREDENTIALS || !process.env.GOOGLE_SHEET_ID) {
      console.log('⚠️ Google Sheets not configured. Skipping sheet logging.');
      return;
    }

    const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const values = [[
      ticketData.ticketNumber,
      ticketData.subject,
      ticketData.category,
      new Date(ticketData.createdAt).toLocaleString(),
      ticketData.status
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:E',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });

    console.log('✅ Logged to Google Sheets:', ticketData.ticketNumber);
  } catch (error) {
    console.error('❌ Error logging to Google Sheets:', error.message);
  }
}

// ============ TYPING INDICATORS ============
const typingStatus = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of typingStatus.entries()) {
    if (now - value.timestamp > 10000) {
      typingStatus.delete(key);
    }
  }
}, 10000);

// ============ NOTIFICATION SYSTEM ============
const notifications = new Map();

function addNotification(ticketNumber, username, message) {
  const notification = {
    ticketNumber,
    username,
    message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
    timestamp: Date.now()
  };
  
  if (!notifications.has('admin')) {
    notifications.set('admin', []);
  }
  
  const adminNotifs = notifications.get('admin');
  adminNotifs.unshift(notification);
  
  if (adminNotifs.length > 50) {
    adminNotifs.pop();
  }
}

// Helper function to generate ticket number
function generateTicketNumber() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${timestamp}${random}`.slice(-5);
}

// ============ API ROUTES ============

// Get notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const adminNotifs = notifications.get('admin') || [];
    const newTicketsCount = await Ticket.countDocuments({ status: 'New' });
    
    res.json({ 
      success: true, 
      notifications: adminNotifs,
      count: adminNotifs.length,
      newTicketsCount 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear notifications for a specific ticket
app.delete('/api/notifications/:ticketNumber', async (req, res) => {
  try {
    const adminNotifs = notifications.get('admin') || [];
    const filtered = adminNotifs.filter(n => n.ticketNumber !== req.params.ticketNumber);
    notifications.set('admin', filtered);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update typing status
app.post('/api/tickets/:ticketNumber/typing', async (req, res) => {
  try {
    const { user, isTyping } = req.body;
    const typingKey = `ticket_${req.params.ticketNumber}`;

    if (isTyping) {
      typingStatus.set(typingKey, {
        user: user,
        timestamp: Date.now()
      });
    } else {
      typingStatus.delete(typingKey);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all tickets (Admin Dashboard) - exclude archived by default
app.get('/api/tickets', async (req, res) => {
  try {
    const showArchived = req.query.archived === 'true';
    const query = showArchived ? { isArchived: true } : { isArchived: { $ne: true } };
    
    const tickets = await Ticket.find(query)
      .sort({ updatedAt: -1 })
      .lean();
    
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

// Get single ticket with messages and typing status
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

    const typingKey = `ticket_${req.params.ticketNumber}`;
    const typing = typingStatus.get(typingKey);
    const isTyping = typing && (Date.now() - typing.timestamp < 10000);
    
    res.json({ 
      success: true, 
      ticket,
      typing: isTyping ? typing.user : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new ticket (Customer submits)
app.post('/api/tickets', async (req, res) => {
  try {
    const { category, username, email, subject, subjectCategory, message } = req.body;

    if (!category || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'Category, subject, and message are required'
      });
    }

    const ticketNumber = generateTicketNumber();

    const ticket = new Ticket({
      ticketNumber,
      category,
      username: username || 'Anonymous',
      email: email || '',
      subject,
      subjectCategory: subjectCategory || '',
      status: 'New',
      messages: [{
        sender: username || 'Anonymous',
        message,
        isInternal: false
      }]
    });

    await ticket.save();

    // Log to Google Sheets
    await logToGoogleSheet({
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      category: ticket.category,
      createdAt: ticket.createdAt,
      status: ticket.status
    });

    // Add notification
    addNotification(ticketNumber, username || 'Anonymous', message);

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

    const typingKey = `ticket_${req.params.ticketNumber}`;
    typingStatus.delete(typingKey);

    // Add notification if message is from customer
    if (sender !== 'Admin' && sender !== 'Sub Admin' && !isInternal) {
      addNotification(req.params.ticketNumber, sender, message);
    }

    res.json({ success: true, ticket });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete internal note (Admin only)
app.delete('/api/tickets/:ticketNumber/messages/:messageId', async (req, res) => {
  try {
    const { ticketNumber, messageId } = req.params;
    
    const ticket = await Ticket.findOne({ ticketNumber });

    if (!ticket) {
      return res.status(404).json({ 
        success: false, 
        error: 'Ticket not found' 
      });
    }

    // Find and remove the message
    const messageIndex = ticket.messages.findIndex(
      msg => msg._id.toString() === messageId
    );

    if (messageIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        error: 'Note not found' 
      });
    }

    // Remove the message
    ticket.messages.splice(messageIndex, 1);
    ticket.updatedAt = Date.now();
    
    await ticket.save();

    res.json({ 
      success: true, 
      message: 'Note deleted successfully',
      ticket 
    });
  } catch (error) {
    console.error('Error deleting note:', error);
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

// Archive ticket (Admin only)
app.patch('/api/tickets/:ticketNumber/archive', async (req, res) => {
  try {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      { 
        isArchived: true, 
        archivedAt: Date.now(),
        updatedAt: Date.now() 
      },
      { new: true }
    );

    if (!ticket) {
      return res.status(404).json({ 
        success: false, 
        error: 'Ticket not found' 
      });
    }

    const typingKey = `ticket_${req.params.ticketNumber}`;
    typingStatus.delete(typingKey);

    res.json({ 
      success: true, 
      ticket,
      message: 'Ticket archived successfully' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download ticket as CSV
app.get('/api/tickets/:ticketNumber/download', async (req, res) => {
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

    // Create CSV content
    let csv = 'Ticket Number,Category,Subject,Username,Email,Status,Assigned Agent,Created At,Updated At\n';
    csv += `"${ticket.ticketNumber}","${ticket.category}","${ticket.subject}","${ticket.username}","${ticket.email || ''}","${ticket.status}","${ticket.assignedAgent || ''}","${new Date(ticket.createdAt).toLocaleString()}","${new Date(ticket.updatedAt).toLocaleString()}"\n\n`;
    
    csv += 'Messages:\n';
    csv += 'Timestamp,Sender,Message,Type\n';
    
    ticket.messages.forEach(msg => {
      const msgText = msg.message.replace(/"/g, '""');
      const msgType = msg.isInternal ? 'Internal Note' : 'Public';
      csv += `"${new Date(msg.createdAt).toLocaleString()}","${msg.sender}","${msgText}","${msgType}"\n`;
    });

    const filename = `ticket-${ticket.ticketNumber}-${Date.now()}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete ticket (Admin only)
app.delete('/api/tickets/:ticketNumber', async (req, res) => {
  try {
    const ticket = await Ticket.findOneAndDelete({ 
      ticketNumber: req.params.ticketNumber 
    });

    if (!ticket) {
      return res.status(404).json({ 
        success: false, 
        error: 'Ticket not found' 
      });
    }

    const typingKey = `ticket_${req.params.ticketNumber}`;
    typingStatus.delete(typingKey);

    res.json({ 
      success: true, 
      message: 'Ticket deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`💬 Customer Portal: http://localhost:${PORT}/`);
  console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin.html`);
  console.log(`❓ Sub Admin (Questions): http://localhost:${PORT}/subadmin.html`);
});


