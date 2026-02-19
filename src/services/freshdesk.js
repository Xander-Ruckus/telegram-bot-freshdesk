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
      
      // Handle both response formats (array or object with agents property)
      const agents = Array.isArray(response.data) ? response.data : (response.data.agents || []);
      
      return agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        email: agent.email,
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
      const response = await this.client.post(`/tickets/${ticketId}/conversations`, {
        body: reply,
        body_html: `<p>${reply}</p>`,
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
