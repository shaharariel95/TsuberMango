// controllers/fridgeController.js
const admin = require("firebase-admin");
const logger = require("../utils/logger");

class FridgeController {
  /**
   * Retrieves the persistent fridge layout from Firestore.
   * If no layout exists, returns an empty layout state.
   */
  async getLayout(req, res) {
    try {
      const db = admin.firestore();
      const docRef = db.collection("config").doc("fridge");
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        logger.info("[FridgeController] Layout document 'config/fridge' not found. Returning empty layout.");
        return res.json({ cells: {} });
      }

      logger.info("[FridgeController] Successfully retrieved fridge layout from Firestore.");
      return res.json(docSnap.data());
    } catch (error) {
      logger.error("[FridgeController] Failed to load fridge layout:", error);
      return res.status(500).json({ 
        error: "טעינת סידור המקרר נכשלה", 
        details: error.message 
      });
    }
  }

  /**
   * Saves the current fridge layout state to Firestore.
   * Logs which user made the change and when.
   */
  async saveLayout(req, res) {
    try {
      const db = admin.firestore();
      const layoutData = req.body;

      if (!layoutData || typeof layoutData !== "object") {
        return res.status(400).json({ error: "מידע לא תקין עבור סידור המקרר" });
      }

      const docRef = db.collection("config").doc("fridge");
      const payload = {
        cells: layoutData.cells || {},
        updatedAt: new Date().toISOString(),
        updatedBy: req.user?.email || "unknown",
      };

      await docRef.set(payload);
      logger.info(`[FridgeController] Fridge layout saved successfully. Updated by ${payload.updatedBy}`);

      return res.json({
        success: true,
        message: "סידור המקרר נשמר בהצלחה",
        data: payload
      });
    } catch (error) {
      logger.error("[FridgeController] Failed to save fridge layout:", error);
      return res.status(500).json({ 
        error: "שמירת סידור המקרר נכשלה", 
        details: error.message 
      });
    }
  }
}

module.exports = new FridgeController();
