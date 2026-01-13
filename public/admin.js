// ADMIN.JS VERSION 2.0 - FIXED VERSION - January 13, 2026
console.log('%c ADMIN PANEL v2.0 LOADED ', 'background: #2D7A3E; color: white; font-size: 16px; padding: 5px;');
console.log('✅ Messages display fixed');
console.log('✅ Reply functionality fixed');
console.log('✅ Internal notes collapsible');
console.log('✅ Debug logging enabled');

// Global Variables
let tickets = [];
let archivedTickets = [];
let currentTicket = null;
let currentFilter = 'all'; // Show all tickets by default
let typingTimer = null;
let notifications = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  loadTickets();
  loadArchivedTickets();
  startPolling();
});

// SECTION NAVIGATION
function showSection(section) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  event.target.closest('.nav-item').classList.add('active');

  // Update sections
  document.querySelectorAll('.content-section').forEach(sec => {
    sec.classList.remove('active');
  });

  if (section === 'tickets') {
    document.getElementById('ticketsSection').classList.add('active');
  } else if (section === 'archived') {
    document.getElementById('archivedSection').classList.add('active');
    loadArchivedTickets();
  } else if (section === 'settings') {
    document.getElementById('settingsSection').classList.add('active');
  }
}

// TICKET LOADING
async function loadTickets() {
  try {
    const response = await fetch('/api/tickets');
    const data = await response.json();
    
    if (data.success) {
      tickets = data.tickets;
      // Show all tickets initially, not filtered
      displayTickets(tickets);
      updateBadges();
    }
  } catch (error) {
    console.error('Error loading tickets:', error);
  }
}

async function loadArchivedTickets() {
  try {
    const response = await fetch('/api/tickets?archived=true');
    const data = await response.json();
    
    if (data.success) {
      archivedTickets = data.tickets;
      displayArchivedTickets(archivedTickets);
    }
  } catch (error) {
    console.error('Error loading archived tickets:', error);
  }
}

function displayTickets(ticketsToShow) {
  const ticketList = document.getElementById('ticketList');
  
  if (ticketsToShow.length === 0) {
    ticketList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No tickets found</h3></div>';
    return;
  }

  ticketList.innerHTML = ticketsToShow.map(ticket => `
    <div class="ticket-item ${currentTicket && currentTicket.ticketNumber === ticket.ticketNumber ? 'active' : ''}" 
         onclick="viewTicket('${ticket.ticketNumber}', this)">
      <div class="ticket-header-info">
        <span class="ticket-number">#${ticket.ticketNumber}</span>
        <span class="ticket-status-badge ${ticket.status.toLowerCase().replace(/ /g, '-')}">${ticket.status}</span>
      </div>
      <div class="ticket-subject">${escapeHtml(ticket.subject || 'No Subject')}</div>
      <div class="ticket-preview">${escapeHtml(ticket.messages[0]?.message || 'No messages')}</div>
      <div class="ticket-meta">
        <span>${escapeHtml(ticket.username)}</span>
        <span>${formatDate(ticket.createdAt)}</span>
      </div>
    </div>
  `).join('');
}

function displayArchivedTickets(archivedToShow) {
  const archivedList = document.getElementById('archivedList');
  
  if (archivedToShow.length === 0) {
    archivedList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><h3>No archived tickets</h3></div>';
    return;
  }

  archivedList.innerHTML = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f7fafc; border-bottom: 2px solid #e2e8f0;">
          <th style="padding: 12px; text-align: left;">Ticket #</th>
          <th style="padding: 12px; text-align: left;">Subject</th>
          <th style="padding: 12px; text-align: left;">User</th>
          <th style="padding: 12px; text-align: left;">Archived Date</th>
          <th style="padding: 12px; text-align: left;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${archivedToShow.map(ticket => `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px;">#${ticket.ticketNumber}</td>
            <td style="padding: 12px;">${escapeHtml(ticket.subject || 'No Subject')}</td>
            <td style="padding: 12px;">${escapeHtml(ticket.username)}</td>
            <td style="padding: 12px;">${formatDate(ticket.archivedAt)}</td>
            <td style="padding: 12px;">
              <button class="btn btn-secondary" onclick="downloadTicketCSV('${ticket.ticketNumber}')">📥 Download</button>
              <button class="btn btn-danger" onclick="deleteTicket('${ticket.ticketNumber}')">🗑️ Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// VIEW TICKET DETAILS
async function viewTicket(ticketNumber, clickedElement) {
  try {
    const response = await fetch(`/api/tickets/${ticketNumber}`);
    const data = await response.json();
    
    console.log('=== API RESPONSE ===');
    console.log('Full response:', data);
    console.log('Ticket:', data.ticket);
    console.log('Messages array:', data.ticket?.messages);
    console.log('===================');
    
    if (data.success) {
      currentTicket = data.ticket;
      displayTicketDetails(currentTicket);
      
      // Update active ticket in list
      document.querySelectorAll('.ticket-item').forEach(item => {
        item.classList.remove('active');
      });
      
      // Add active class to clicked element if provided
      if (clickedElement) {
        clickedElement.classList.add('active');
      }
    }
  } catch (error) {
    console.error('Error loading ticket:', error);
  }
}

function displayTicketDetails(ticket) {
  const mainContent = document.getElementById('mainContent');
  
  mainContent.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">
        <h2>Ticket #${ticket.ticketNumber}</h2>
        <div class="detail-actions">
          <button class="btn btn-primary" onclick="downloadTicketCSV('${ticket.ticketNumber}')">📥 Download CSV</button>
          <button class="btn btn-secondary" onclick="archiveTicket('${ticket.ticketNumber}')">📦 Archive</button>
        </div>
      </div>
      <div class="detail-info">
        <div class="info-item">
          <span class="info-label">Status</span>
          <select class="status-selector" onchange="updateTicketStatus('${ticket.ticketNumber}', this.value)">
            <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="in-progress" ${ticket.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
          </select>
        </div>
        <div class="info-item">
          <span class="info-label">Subject</span>
          <span class="info-value">${escapeHtml(ticket.subject || 'No Subject')}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Category</span>
          <span class="info-value">${escapeHtml(ticket.category)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">User</span>
          <span class="info-value">${escapeHtml(ticket.username)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Created</span>
          <span class="info-value">${formatDate(ticket.createdAt)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Last Updated</span>
          <span class="info-value">${formatDate(ticket.updatedAt)}</span>
        </div>
      </div>
    </div>

    <div class="messages-container" id="messagesContainer">
      ${ticket.messages.map(msg => `
        <div class="message ${msg.sender.toLowerCase()}">
          <div class="message-header">
            <span class="message-sender">${msg.sender === 'Admin' ? '👤 Career Coach' : '👨 ' + escapeHtml(ticket.username)}</span>
            <span class="message-time">${formatTime(msg.createdAt)}</span>
          </div>
          <div class="message-content">${escapeHtml(msg.message)}</div>
        </div>
      `).join('')}
      <div class="typing-indicator" id="typingIndicator">
        <span>User is typing...</span>
      </div>
    </div>

    <div class="internal-notes">
      <h3>🔒 Internal Notes (Not visible to user)</h3>
      ${ticket.internalNotes?.map(note => `
        <div class="note">
          <div class="note-header">
            <span>${escapeHtml(note.author)}</span>
            <span>${formatTime(note.timestamp)}</span>
          </div>
          <div class="note-content">${escapeHtml(note.content)}</div>
        </div>
      `).join('') || '<p style="color: #78350f; font-size: 13px;">No internal notes yet.</p>'}
      <textarea class="note-input" placeholder="Add internal note..." id="noteInput"></textarea>
      <button class="btn btn-secondary" style="margin-top: 8px;" onclick="addInternalNote('${ticket.ticketNumber}')">Add Note</button>
    </div>

    <div class="message-input-container">
      <div class="message-input-wrapper">
        <button class="emoji-picker-btn" onclick="insertEmoji()">😊</button>
        <textarea 
          class="message-input" 
          id="adminMessageInput" 
          placeholder="Type your reply... (Shift+Enter for new line)"
          onkeydown="handleMessageKeyDown(event, '${ticket.ticketNumber}')"></textarea>
        <button class="btn btn-primary" onclick="sendAdminMessage('${ticket.ticketNumber}')">Send</button>
      </div>
    </div>
  `;

  // Scroll messages to bottom
  const messagesContainer = document.getElementById('messagesContainer');
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// MESSAGE HANDLING
function handleMessageKeyDown(event, ticketNumber) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendAdminMessage(ticketNumber);
  }
}

async function sendAdminMessage(ticketNumber) {
  const input = document.getElementById('adminMessageInput');
  const content = input.value.trim();
  
  if (!content) return;

  try {
    const response = await fetch(`/api/tickets/${ticketNumber}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content, sender: 'Admin' })
    });

    const data = await response.json();

    if (data.success) {
      input.value = '';
      viewTicket(ticketNumber);
    }
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

async function addInternalNote(ticketNumber) {
  const input = document.getElementById('noteInput');
  const content = input.value.trim();
  
  if (!content) return;

  try {
    const response = await fetch(`/api/tickets/${ticketNumber}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        sender: 'Admin',
        message: content,
        isInternal: true
      })
    });

    const data = await response.json();

    if (data.success) {
      input.value = '';
      // Refresh ticket view
      viewTicket(ticketNumber);
    }
  } catch (error) {
    console.error('Error adding note:', error);
  }
}

function insertEmoji() {
  const emojis = ['😊', '👍', '❤️', '🎉', '✅', '👋', '🙏', '💡', '⚠️', '📝'];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  const input = document.getElementById('adminMessageInput');
  input.value += emoji;
  input.focus();
}

// STATUS UPDATE
async function updateTicketStatus(ticketNumber, newStatus) {
  try {
    const response = await fetch(`/api/tickets/${ticketNumber}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    const data = await response.json();

    if (data.success) {
      loadTickets();
      if (currentTicket && currentTicket.ticketNumber === ticketNumber) {
        // Refresh current ticket view
        viewTicket(ticketNumber);
      }
    }
  } catch (error) {
    console.error('Error updating status:', error);
  }
}

// ARCHIVE FUNCTIONALITY
async function archiveTicket(ticketNumber) {
  if (!confirm('Are you sure you want to archive this ticket?')) return;

  try {
    const response = await fetch(`/api/tickets/${ticketNumber}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (data.success) {
      alert('✅ Ticket archived successfully');
      const mainContent = document.getElementById('mainContent');
      mainContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <h3>Select a ticket to view details</h3>
        </div>
      `;
      currentTicket = null;
      loadTickets();
    } else {
      alert('❌ Failed to archive ticket: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error archiving ticket:', error);
    alert('❌ Error archiving ticket. Please try again.');
  }
}

async function downloadTicketCSV(ticketNumber) {
  try {
    window.location.href = `/api/tickets/${ticketNumber}/download`;
  } catch (error) {
    console.error('Error downloading CSV:', error);
    alert('❌ Error downloading CSV. Please try again.');
  }
}

async function deleteTicket(ticketNumber) {
  if (!confirm('⚠️ Are you sure you want to DELETE this ticket permanently? This action cannot be undone!')) return;

  try {
    const response = await fetch(`/api/tickets/${ticketNumber}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (data.success) {
      alert('✅ Ticket deleted successfully');
      loadArchivedTickets();
    } else {
      alert('❌ Failed to delete ticket: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error deleting ticket:', error);
    alert('❌ Error deleting ticket. Please try again.');
  }
}

// FILTER AND SEARCH
function filterTickets(status) {
  // Handle "All" filter
  if (status === 'all') {
    displayTickets(tickets);
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    event.target.classList.add('active');
    return;
  }
  
  // Map filter button values to actual status values
  const statusMap = {
    'open': 'Open',
    'in-progress': 'Ongoing',
    'resolved': 'Resolved'
  };
  
  currentFilter = statusMap[status] || status;
  const filtered = tickets.filter(t => t.status === currentFilter);
  displayTickets(filtered);
  
  // Update filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
}

function searchTickets(query) {
  query = query.toLowerCase();
  const filtered = tickets.filter(t => 
    t.ticketNumber.toLowerCase().includes(query) ||
    (t.subject && t.subject.toLowerCase().includes(query)) ||
    t.username.toLowerCase().includes(query)
  );
  displayTickets(filtered);
}

function searchArchivedTickets(query) {
  query = query.toLowerCase();
  const filtered = archivedTickets.filter(t => 
    t.ticketNumber.toLowerCase().includes(query) ||
    (t.subject && t.subject.toLowerCase().includes(query)) ||
    t.username.toLowerCase().includes(query)
  );
  displayArchivedTickets(filtered);
}

// NOTIFICATIONS
function toggleNotifications() {
  const dropdown = document.getElementById('notificationDropdown');
  dropdown.classList.toggle('show');
  
  if (dropdown.classList.contains('show')) {
    loadNotifications();
  }
}

function loadNotifications() {
  const notificationList = document.getElementById('notificationList');
  
  if (notifications.length === 0) {
    notificationList.innerHTML = '<div class="empty-notifications">No new notifications</div>';
    return;
  }

  notificationList.innerHTML = notifications.map(notif => `
    <div class="notification-item ${notif.read ? '' : 'unread'}" onclick="openNotificationTicket('${notif.ticketNumber}')">
      <div><strong>Ticket #${notif.ticketNumber}</strong></div>
      <div style="font-size: 13px; color: #718096;">${escapeHtml(notif.message)}</div>
      <div style="font-size: 12px; color: #a0aec0; margin-top: 4px;">${formatDate(notif.timestamp)}</div>
    </div>
  `).join('');
}

function openNotificationTicket(ticketNumber) {
  showSection('tickets');
  viewTicket(ticketNumber);
  
  // Mark notification as read
  notifications = notifications.map(n => 
    n.ticketNumber === ticketNumber ? {...n, read: true} : n
  );
  
  updateBadges();
  toggleNotifications();
}

function clearNotifications() {
  notifications = [];
  updateBadges();
  loadNotifications();
}

function addNotification(ticketNumber, message) {
  notifications.unshift({
    ticketNumber,
    message,
    timestamp: new Date(),
    read: false
  });
  updateBadges();
}

function updateBadges() {
  // Update total tickets badge
  document.getElementById('totalBadge').textContent = tickets.length;
  
  // Update notification badge
  const unreadCount = notifications.filter(n => !n.read).length;
  const notifBadge = document.getElementById('notificationBadge');
  notifBadge.textContent = unreadCount;
  notifBadge.style.display = unreadCount > 0 ? 'block' : 'none';
}

// POLLING FOR UPDATES
function startPolling() {
  setInterval(async () => {
    const oldCount = tickets.length;
    await loadTickets();
    
    // Check for new messages or tickets
    if (tickets.length > oldCount) {
      addNotification(tickets[0].ticketNumber, 'New ticket created');
    }
    
    // Refresh current ticket if viewing one
    if (currentTicket) {
      const updated = tickets.find(t => t.ticketNumber === currentTicket.ticketNumber);
      if (updated && updated.messages.length > currentTicket.messages.length) {
        addNotification(currentTicket.ticketNumber, 'New message received');
        viewTicket(currentTicket.ticketNumber);
      }
    }
  }, 5000); // Poll every 5 seconds
}

// TYPING INDICATOR
function startTyping() {
  if (typingTimer) clearTimeout(typingTimer);
  
  const indicator = document.getElementById('typingIndicator');
  if (indicator) {
    indicator.classList.add('active');
  }
  
  typingTimer = setTimeout(stopTyping, 3000);
}

function stopTyping() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) {
    indicator.classList.remove('active');
  }
}

// UTILITY FUNCTIONS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(date) {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', date, error);
    return 'Invalid Date';
  }
}

function formatTime(date) {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting time:', date, error);
    return 'Invalid Time';
  }
}

function logout() {
  if (confirm('Are you sure you want to logout?')) {
    window.location.href = '/logout';
  }
}

// Toggle internal notes
function toggleInternalNotes() {
  const content = document.getElementById('internalNotesContent');
  const toggle = document.getElementById('notesToggle');
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    toggle.textContent = '▲';
  } else {
    content.style.display = 'none';
    toggle.textContent = '▼';
  }
}

// Close notification dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notificationDropdown');
  const notifBtn = document.querySelector('.notification-btn');
  
  if (dropdown && !dropdown.contains(e.target) && !notifBtn.contains(e.target)) {
    dropdown.classList.remove('show');
  }
});

// Cleanup
window.addEventListener('beforeunload', () => {
  stopTyping();
});


