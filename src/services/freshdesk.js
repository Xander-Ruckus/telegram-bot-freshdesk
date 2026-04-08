import axios from 'axios';
import { logger } from '../utils/logger.js';

export class Freshdesk {
  constructor(domain, apiKey) {
    this.domain = domain;
    this.apiKey = apiKey;
    this.baseURL = `https://${domain}/api/v2`;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      auth: {
        username: apiKey,
        password: 'X',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get API status
   */
  async getStatus() {
    try {
      const response = await this.client.get('/agents', { params: { per_page: 1 } });
      return { connected: true };
    } catch (error) {
      logger.error('Freshdesk status check failed:', error.message);
      return { connected: false };
    }
  }

  /**
   * Get recent tickets
   */
  async getRecentTickets(limit = 10) {
    try {
      const response = await this.client.get('/tickets', {
        params: {
          per_page: limit,
          order_by: 'created_at',
          order_type: 'desc',
        },
      });
      
      // Handle both response formats (array or object with tickets property)
      const tickets = Array.isArray(response.data) ? response.data : (response.data.tickets || []);
      
      return tickets.map(ticket => ({
        id: ticket.id,
        subject: ticket.subject,
        status: this._formatStatus(ticket.status),
        priority: this._formatPriority(ticket.priority),
        created_at: ticket.created_at,
        customer_name: ticket.requester_id,
      }));
    } catch (error) {
      logger.error('Error fetching tickets:', error.message);
      throw error;
    }
  }

  /**
   * Get ALL tickets with pagination (no limit)
   */
  async getAllTickets() {
    try {
      let allTickets = [];
      let page = 1;
      let hasMore = true;
      const perPage = 100; // Maximum per Freshdesk API is 100

      logger.info('Fetching all tickets with pagination...');

      while (hasMore) {
        const response = await this.client.get('/tickets', {
          params: {
            page: page,
            per_page: perPage,
            order_by: 'created_at',
            order_type: 'desc',
          },
        });

        // Handle both response formats
        const tickets = Array.isArray(response.data) ? response.data : (response.data.tickets || []);
        
        if (tickets.length === 0) {
          hasMore = false;
          break;
        }

        // Map tickets to our format
        const mappedTickets = tickets.map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          status: this._formatStatus(ticket.status),
          priority: this._formatPriority(ticket.priority),
          created_at: ticket.created_at,
          customer_name: ticket.requester_id,
        }));

        allTickets = allTickets.concat(mappedTickets);
        logger.info(`Fetched ${tickets.length} tickets from page ${page}. Total so far: ${allTickets.length}`);

        // Check if there are more pages
        if (tickets.length < perPage) {
          hasMore = false;
        } else {
          page++;
        }
      }

      logger.info(`Successfully fetched all ${allTickets.length} tickets`);
      return allTickets;
    } catch (error) {
      logger.error('Error fetching all tickets:', error.message);
      throw error;
    }
  }

  /**
   * Get ticket by ID
   */
  async getTicket(ticketId) {
    try {
      const response = await this.client.get(`/tickets/${ticketId}`);
      // Handle both response formats (direct object or wrapped in ticket property)
      const ticket = response.data?.ticket || response.data;
      
      if (!ticket || !ticket.id) {
        logger.error(`Invalid ticket response for ${ticketId}:`, response.data);
        throw new Error(`Invalid ticket response - ticket data not found`);
      }
      
      return {
        id: ticket.id,
        subject: ticket.subject,
        description: ticket.description_text || ticket.description || '',
        status: this._formatStatus(ticket.status),
        priority: this._formatPriority(ticket.priority),
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        customer_email: ticket.custom_fields?.email || ticket.email || 'N/A',
      };
    } catch (error) {
      logger.error(`Error fetching ticket ${ticketId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all agents
   */
  async getAgents() {
    try {
      const response = await this.client.get('/agents', {
        params: { per_page: 100 },
      });
      
      // Agents comes as a direct array from the API
      const agents = Array.isArray(response.data) ? response.data : (response.data.agents || []);
      
      return agents.map(agent => ({
        id: agent.id,
        name: agent.contact?.name || agent.name || 'Unknown Agent',
        email: agent.contact?.email || agent.email || 'N/A',
        available: agent.available,
        ticket_scope: agent.ticket_scope,
      }));
    } catch (error) {
      logger.error('Error fetching agents:', error.message);
      throw error;
    }
  }

  /**
   * Get contacts
   */
  async getContacts(limit = 20) {
    try {
      const response = await this.client.get('/contacts', {
        params: { per_page: limit },
      });
      
      // Handle both response formats (array or object with contacts property)
      const contacts = Array.isArray(response.data) ? response.data : (response.data.contacts || []);
      
      return contacts.map(contact => ({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
      }));
    } catch (error) {
      logger.error('Error fetching contacts:', error.message);
      throw error;
    }
  }

  /**
   * Get conversations for a ticket
   */
  async getConversations(ticketId) {
    try {
      const response = await this.client.get(`/tickets/${ticketId}/conversations`);
      
      // Handle both response formats (array or object with conversations property)
      const conversations = Array.isArray(response.data) ? response.data : (response.data.conversations || []);
      
      return conversations.map(conv => ({
        id: conv.id,
        body: conv.body_text,
        user_id: conv.user_id,
        created_at: conv.created_at,
        private: conv.private,
      }));
    } catch (error) {
      logger.error(`Error fetching conversations for ticket ${ticketId}:`, error.message);
      throw error;
    }
  }

  /**
   * Search tickets
   */
  async searchTickets(query, filters = {}) {
    try {
      let queryString = `"${query}"`;

      if (filters.status) {
        queryString += ` AND status:"${filters.status}"`;
      }
      if (filters.priority) {
        queryString += ` AND priority:${filters.priority}`;
      }
      if (filters.agent_id) {
        queryString += ` AND responder_id:${filters.agent_id}`;
      }

      const response = await this.client.get('/search/tickets', {
        params: { query: queryString },
      });

      return response.data.results;
    } catch (error) {
      logger.error('Error searching tickets:', error.message);
      throw error;
    }
  }

  /**
   * Get ticket metrics
   */
  async getTicketMetrics() {
    try {
      const response = await this.client.get('/tickets', { params: { per_page: 1 } });
      
      return {
        total: response.data.total,
        total_unseen: response.data.total_unseen || 0,
      };
    } catch (error) {
      logger.error('Error fetching ticket metrics:', error.message);
      throw error;
    }
  }

  /**
   * Merge related tickets (Down -> Up status changes)
   * Closes the old "Down" ticket and adds a link to the new "Up" ticket
   */
  async mergeRelatedTickets(newTicketId, newTicketSubject) {
    try {
      // Extract device name from subject
      // Format: "DEVICE-NAME (IP) : STATE - Up/Down"
      const deviceMatch = newTicketSubject.match(/^(.+?)\s*:\s*STATE\s*-\s*(Up|Down)$/i);
      
      if (!deviceMatch) {
        logger.debug(`Ticket ${newTicketId} doesn't match device pattern, skipping merge`);
        return null;
      }

      const deviceName = deviceMatch[1].trim();
      const currentStatus = deviceMatch[2].toLowerCase();
      const oppositeStatus = currentStatus === 'up' ? 'down' : 'up';

      logger.info(`Checking for merge: Device "${deviceName}" now ${currentStatus}, looking for ${oppositeStatus} ticket...`);

      // Search for all open/pending tickets with the same device name but opposite status
      const allTickets = await this.getAllTickets();
      
      const relatedTickets = allTickets.filter(t => {
        const ticketMatch = t.subject.match(/^(.+?)\s*:\s*STATE\s*-\s*(Up|Down)$/i);
        if (!ticketMatch) return false;
        
        const ticketDevice = ticketMatch[1].trim();
        const ticketStatus = ticketMatch[2].toLowerCase();
        
        return ticketDevice === deviceName && 
               ticketStatus === oppositeStatus &&
               t.id !== newTicketId &&
               t.status !== 'Closed' &&
               t.status !== 'Resolved';
      });

      if (relatedTickets.length === 0) {
        logger.info(`No related ${oppositeStatus} ticket found for device "${deviceName}"`);
        return null;
      }

      // Get the most recent related ticket
      const oldTicket = relatedTickets.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      )[0];

      logger.info(`Found related ticket #${oldTicket.id} (${oldTicket.status}). Merging with #${newTicketId}...`);

      // Close the old ticket
      await this.updateTicketStatus(oldTicket.id, 'closed');
      
      // Add note to new ticket linking to old ticket
      const mergeNote = `🔗 MERGED: This ticket (#${newTicketId}) includes the resolution of ticket #${oldTicket.id}\n` +
                        `Previous Status: ${oldTicket.subject}\n` +
                        `Resolution: Device returned to UP status`;
      
      await this.addTicketNote(newTicketId, mergeNote, true);

      // Add note to old ticket linking to new ticket
      const oldTicketNote = `🔗 MERGED: Ticket #${newTicketId} has been created after device returned to UP status.\n` +
                             `This ticket (#${oldTicket.id}) has been closed as the issue is now resolved.`;
      
      await this.addTicketNote(oldTicket.id, oldTicketNote, true);

      logger.info(`✅ Successfully merged ticket #${oldTicket.id} with #${newTicketId}`);

      return {
        mergedTicketId: oldTicket.id,
        newTicketId: newTicketId,
        deviceName: deviceName,
        previousStatus: oldTicket.status
      };
    } catch (error) {
      logger.error(`Error merging related tickets for #${newTicketId}:`, error.message);
      // Don't throw - merging is a nice-to-have feature
      return null;
    }
  }

  // ============ UPDATE METHODS ============

  /**
   * Update ticket status
   */
  async updateTicketStatus(ticketId, status) {
    try {
      const statusMap = {
        'open': 2,
        'pending': 3,
        'resolved': 4,
        'closed': 5,
        'on hold': 6,
        'reopened': 7,
        'waiting': 8,
        'assigned': 9,
      };
      
      const statusCode = statusMap[status.toLowerCase()] || parseInt(status);
      
      const response = await this.client.put(`/tickets/${ticketId}`, {
        status: statusCode,
      });
      
      logger.info(`Ticket ${ticketId} status updated to ${status}`);
      return response.data;
    } catch (error) {
      logger.error(`Error updating ticket ${ticketId} status:`, error.message);
      throw error;
    }
  }

  /**
   * Update ticket priority
   */
  async updateTicketPriority(ticketId, priority) {
    try {
      const priorityMap = {
        'low': 1,
        'medium': 2,
        'high': 3,
        'urgent': 4,
      };
      
      const priorityCode = priorityMap[priority.toLowerCase()] || parseInt(priority);
      
      const response = await this.client.put(`/tickets/${ticketId}`, {
        priority: priorityCode,
      });
      
      logger.info(`Ticket ${ticketId} priority updated to ${priority}`);
      return response.data;
    } catch (error) {
      logger.error(`Error updating ticket ${ticketId} priority:`, error.message);
      throw error;
    }
  }

  /**
   * Add note/comment to ticket
   */
  async addTicketNote(ticketId, note, isPrivate = false) {
    try {
      const response = await this.client.post(`/tickets/${ticketId}/notes`, {
        body: note,
        private: isPrivate,
      });
      
      logger.info(`Note added to ticket ${ticketId}`);
      return response.data;
    } catch (error) {
      logger.error(`Error adding note to ticket ${ticketId}:`, error.message);
      throw error;
    }
  }

  /**
   * Add reply/conversation to ticket
   */
  async addTicketReply(ticketId, reply) {
    try {
      // Try using notes endpoint as fallback for closure comments
      // This adds an internal note (private comment) to the ticket
      const response = await this.client.post(`/tickets/${ticketId}/notes`, {
        body: reply,
        private: false, // Set to false for agent replies
      });
      
      logger.info(`Reply added to ticket ${ticketId}`);
      return response.data;
    } catch (error) {
      logger.error(`Error adding reply to ticket ${ticketId}:`, error.message);
      throw error;
    }
  }

  /**
   * Assign ticket to agent
   */
  async assignTicket(ticketId, agentId) {
    try {
      const response = await this.client.put(`/tickets/${ticketId}`, {
        responder_id: agentId,
      });
      
      logger.info(`Ticket ${ticketId} assigned to agent ${agentId}`);
      return response.data;
    } catch (error) {
      logger.error(`Error assigning ticket ${ticketId}:`, error.message);
      throw error;
    }
  }

  /**
   * Close ticket (sets status to closed = 5) with optional comment
   */
  async closeTicket(ticketId, reason = null) {
    try {
      // Close the ticket
      const response = await this.client.put(`/tickets/${ticketId}`, {
        status: 5, // 5 = Closed
      });
      
      // Add a comment with closure details
      if (reason) {
        const timestamp = new Date().toISOString();
        const comment = `[AUTOMATED] Ticket closed at ${timestamp}\nReason: ${reason}`;
        
        try {
          await this.addTicketReply(ticketId, comment);
        } catch (err) {
          logger.warn(`Could not add closure comment to ticket ${ticketId}:`, err.message);
        }
      }
      
      logger.info(`Ticket ${ticketId} closed${reason ? ` - Reason: ${reason}` : ''}`);
      return response.data;
    } catch (error) {
      logger.error(`Error closing ticket ${ticketId}:`, error.message);
      throw error;
    }
  }

  /**
   * Close ticket and assign to agent in one operation
   */
  async closeAndAssignTicket(ticketId, agentId) {
    try {
      const response = await this.client.put(`/tickets/${ticketId}`, {
        status: 5, // Closed status
        responder_id: agentId,
      });
      
      logger.info(`Ticket ${ticketId} closed and assigned to agent ${agentId}`);
      return response.data;
    } catch (error) {
      logger.error(`Error closing and assigning ticket ${ticketId}:`, error.message);
      throw error;
    }
  }

  // ============ UTILITY METHODS ============

  _formatStatus(status) {
    const statusMap = {
      2: 'Open',
      3: 'Pending',
      4: 'Resolved',
      5: 'Closed',
      6: 'On Hold',
      7: 'Reopened',
      8: 'Waiting on customer',
      9: 'Assigned',
    };
    return statusMap[status] || 'Unknown';
  }

  _formatPriority(priority) {
    const priorityMap = {
      1: 'Low',
      2: 'Medium',
      3: 'High',
      4: 'Urgent',
    };
    return priorityMap[priority] || 'Unknown';
  }
}
