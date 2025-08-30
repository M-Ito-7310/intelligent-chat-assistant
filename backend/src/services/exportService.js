import PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';
import { contextService } from './contextService.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Export Service for conversation data
 * Supports PDF, JSON, and CSV formats
 */
class ExportService {
  constructor() {
    this.exportDir = path.join(__dirname, '../../exports');
    this.ensureExportDir();
  }

  /**
   * Ensure export directory exists
   */
  async ensureExportDir() {
    try {
      await fs.mkdir(this.exportDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create export directory:', error);
    }
  }

  /**
   * Export conversation to PDF
   */
  async exportConversationToPDF(userId, conversationId) {
    try {
      // Get conversation data
      const context = await contextService.getConversationContext(conversationId, {
        includeSystem: false
      });

      // Verify ownership
      if (context.conversation.user_id !== userId) {
        throw new Error('Access denied. Not your conversation');
      }

      const filename = `conversation-${conversationId}-${Date.now()}.pdf`;
      const filepath = path.join(this.exportDir, filename);

      // Create PDF document
      const doc = new PDFDocument({
        margin: 50,
        font: 'Helvetica'
      });

      // Pipe to file
      doc.pipe(createWriteStream(filepath));

      // Add header
      doc.fontSize(20)
         .text('AI Chatbot Conversation Export', { align: 'center' })
         .moveDown();

      // Add conversation details
      doc.fontSize(12)
         .text(`Title: ${context.conversation.title}`)
         .text(`Date: ${new Date(context.conversation.created_at).toLocaleString()}`)
         .text(`Messages: ${context.messages.length}`)
         .text(`Total Tokens: ${context.totalTokens}`)
         .moveDown(2);

      // Add messages
      context.messages.forEach((message, index) => {
        const role = message.role === 'user' ? 'You' : 'AI Assistant';
        const timestamp = new Date(message.created_at).toLocaleString();
        
        doc.fontSize(10)
           .fillColor('#666')
           .text(`${role} - ${timestamp}`)
           .moveDown(0.5);
           
        doc.fontSize(11)
           .fillColor('#000')
           .text(message.content, {
             width: 500,
             align: 'left'
           })
           .moveDown(1.5);

        // Add page break if needed
        if (index < context.messages.length - 1 && doc.y > 700) {
          doc.addPage();
        }
      });

      // Finalize PDF
      doc.end();

      logger.info(`PDF export created: ${filename}`);

      return {
        filename,
        filepath,
        filesize: await this.getFileSize(filepath),
        format: 'pdf'
      };

    } catch (error) {
      logger.error('PDF export error:', error);
      throw error;
    }
  }

  /**
   * Export conversation to JSON
   */
  async exportConversationToJSON(userId, conversationId) {
    try {
      // Get conversation data
      const context = await contextService.getConversationContext(conversationId, {
        includeSystem: false
      });

      // Verify ownership
      if (context.conversation.user_id !== userId) {
        throw new Error('Access denied. Not your conversation');
      }

      const filename = `conversation-${conversationId}-${Date.now()}.json`;
      const filepath = path.join(this.exportDir, filename);

      // Prepare export data
      const exportData = {
        conversation: {
          id: context.conversation.id,
          title: context.conversation.title,
          created_at: context.conversation.created_at,
          updated_at: context.conversation.updated_at,
          message_count: context.messages.length,
          total_tokens: context.totalTokens
        },
        messages: context.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          created_at: msg.created_at,
          metadata: msg.metadata || {}
        })),
        export_info: {
          exported_at: new Date().toISOString(),
          exported_by: userId,
          format: 'json',
          version: '1.0'
        }
      };

      // Write to file
      await fs.writeFile(filepath, JSON.stringify(exportData, null, 2));

      logger.info(`JSON export created: ${filename}`);

      return {
        filename,
        filepath,
        filesize: await this.getFileSize(filepath),
        format: 'json',
        data: exportData
      };

    } catch (error) {
      logger.error('JSON export error:', error);
      throw error;
    }
  }

  /**
   * Export conversation to CSV
   */
  async exportConversationToCSV(userId, conversationId) {
    try {
      // Get conversation data
      const context = await contextService.getConversationContext(conversationId, {
        includeSystem: false
      });

      // Verify ownership
      if (context.conversation.user_id !== userId) {
        throw new Error('Access denied. Not your conversation');
      }

      const filename = `conversation-${conversationId}-${Date.now()}.csv`;
      const filepath = path.join(this.exportDir, filename);

      // Prepare CSV data
      const csvHeaders = ['Timestamp', 'Role', 'Content', 'Model', 'Tokens'];
      const csvRows = [csvHeaders.join(',')];

      context.messages.forEach(msg => {
        const row = [
          `"${new Date(msg.created_at).toISOString()}"`,
          `"${msg.role}"`,
          `"${msg.content.replace(/"/g, '""')}"`, // Escape quotes
          `"${msg.metadata?.model || ''}"`,
          `"${msg.metadata?.usage?.total_tokens || 0}"`
        ];
        csvRows.push(row.join(','));
      });

      // Write to file
      await fs.writeFile(filepath, csvRows.join('\n'));

      logger.info(`CSV export created: ${filename}`);

      return {
        filename,
        filepath,
        filesize: await this.getFileSize(filepath),
        format: 'csv'
      };

    } catch (error) {
      logger.error('CSV export error:', error);
      throw error;
    }
  }

  /**
   * Export multiple conversations
   */
  async exportMultipleConversations(userId, conversationIds, format = 'json') {
    try {
      const filename = `conversations-${userId}-${Date.now()}.${format}`;
      const filepath = path.join(this.exportDir, filename);

      if (format === 'json') {
        const exportData = {
          conversations: [],
          export_info: {
            exported_at: new Date().toISOString(),
            exported_by: userId,
            format: 'json',
            version: '1.0'
          }
        };

        for (const conversationId of conversationIds) {
          try {
            const context = await contextService.getConversationContext(conversationId, {
              includeSystem: false
            });

            if (context.conversation.user_id === userId) {
              exportData.conversations.push({
                conversation: context.conversation,
                messages: context.messages,
                totalTokens: context.totalTokens
              });
            }
          } catch (error) {
            logger.warn(`Failed to export conversation ${conversationId}:`, error);
          }
        }

        await fs.writeFile(filepath, JSON.stringify(exportData, null, 2));

        return {
          filename,
          filepath,
          filesize: await this.getFileSize(filepath),
          format: 'json',
          count: exportData.conversations.length
        };
      }

      throw new Error(`Format ${format} not supported for multiple conversations`);

    } catch (error) {
      logger.error('Multiple conversations export error:', error);
      throw error;
    }
  }

  /**
   * Get user's export history
   */
  async getUserExports(userId) {
    try {
      const files = await fs.readdir(this.exportDir);
      const userFiles = files.filter(file => 
        file.includes(`-${userId}-`) || file.includes(`conversation-`)
      );

      const exports = await Promise.all(
        userFiles.map(async (filename) => {
          const filepath = path.join(this.exportDir, filename);
          const stats = await fs.stat(filepath);
          
          return {
            filename,
            created_at: stats.birthtime.toISOString(),
            size: stats.size,
            format: path.extname(filename).substring(1)
          };
        })
      );

      return exports.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    } catch (error) {
      logger.error('Get user exports error:', error);
      return [];
    }
  }

  /**
   * Clean up old export files
   */
  async cleanupOldExports(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days
    try {
      const files = await fs.readdir(this.exportDir);
      const now = Date.now();
      let cleaned = 0;

      for (const filename of files) {
        const filepath = path.join(this.exportDir, filename);
        const stats = await fs.stat(filepath);
        
        if (now - stats.birthtime.getTime() > maxAge) {
          await fs.unlink(filepath);
          cleaned++;
          logger.info(`Cleaned up old export: ${filename}`);
        }
      }

      return cleaned;

    } catch (error) {
      logger.error('Cleanup exports error:', error);
      return 0;
    }
  }

  /**
   * Get file size
   */
  async getFileSize(filepath) {
    try {
      const stats = await fs.stat(filepath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Delete export file
   */
  async deleteExport(filename) {
    try {
      const filepath = path.join(this.exportDir, filename);
      await fs.unlink(filepath);
      logger.info(`Deleted export: ${filename}`);
      return true;
    } catch (error) {
      logger.error('Delete export error:', error);
      return false;
    }
  }
}

// Singleton instance
export const exportService = new ExportService();