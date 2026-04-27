const sharp = require('sharp');
const { imageHash } = require('image-hash');
const { promisify } = require('util');
const pool = require('../config/database');

const imageHashAsync = promisify(imageHash);

class ImageValidationService {
  static async generateImageHash(imagePath) {
    try {
      // Generate perceptual hash using image-hash library
      const hash = await imageHashAsync(imagePath, 16, true);
      return hash;
    } catch (error) {
      console.error('Image hash generation error:', error);
      throw new Error('Failed to generate image hash');
    }
  }

  static async checkDuplicateImage(hash, excludeComplaintId = null) {
    try {
      let query = 'SELECT complaint_id FROM image_hashes WHERE image_hash = $1';
      let params = [hash];

      if (excludeComplaintId) {
        query += ' AND complaint_id != $2';
        params.push(excludeComplaintId);
      }

      const result = await pool.query(query, params);
      return result.rows.length > 0 ? result.rows[0].complaint_id : null;
    } catch (error) {
      console.error('Duplicate image check error:', error);
      return null;
    }
  }

  static async storImageHash(complaintId, hash, client = null) {
    const dbClient = client || pool;
    try {
      await dbClient.query(
        'INSERT INTO image_hashes (complaint_id, image_hash) VALUES ($1, $2)',
        [complaintId, hash]
      );
    } catch (error) {
      console.error('Store image hash error:', error);
      throw error;
    }
  }

  static hammingDistance(hash1, hash2) {
    if (hash1.length !== hash2.length) return Infinity;
    
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    return distance;
  }

  static async findSimilarImages(hash, threshold = 5) {
    try {
      const result = await pool.query('SELECT complaint_id, image_hash FROM image_hashes');
      const similarImages = [];

      for (const row of result.rows) {
        const distance = this.hammingDistance(hash, row.image_hash);
        if (distance <= threshold) {
          similarImages.push({
            complaintId: row.complaint_id,
            hash: row.image_hash,
            distance
          });
        }
      }

      return similarImages;
    } catch (error) {
      console.error('Find similar images error:', error);
      return [];
    }
  }

  static async validateImage(imagePath, complaintId = null) {
    try {
      // Generate hash
      const hash = await this.generateImageHash(imagePath);
      
      // Check for exact duplicates
      const duplicateComplaintId = await this.checkDuplicateImage(hash, complaintId);
      
      // Check for similar images
      const similarImages = await this.findSimilarImages(hash, 5);
      
      return {
        hash,
        isDuplicate: !!duplicateComplaintId,
        duplicateOf: duplicateComplaintId,
        similarImages: similarImages.filter(img => img.complaintId !== complaintId),
        validationStatus: duplicateComplaintId ? 'DUPLICATE' : 
                         (similarImages.length > 1 ? 'SUSPECTED' : 'VALID')
      };
    } catch (error) {
      console.error('Image validation error:', error);
      return {
        hash: null,
        isDuplicate: false,
        duplicateOf: null,
        similarImages: [],
        validationStatus: 'VALID',
        error: error.message
      };
    }
  }
}

module.exports = ImageValidationService;