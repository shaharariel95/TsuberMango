const shippingLabelsService = require('../services/shippingLabelsService');

class ShippingLabelsController {
    async createNewPageFromBase() {
        try {
            // Step 1: Get the next ID
            const newId = await shippingLabelsService.getAndIncrementHighestId();

            // Step 2: Convert the ID to a string for the new sheet name
            const newSheetName = `${newId}`;

            // Step 3: Copy the "base" sheet and assign it the new name
            const result = await shippingLabelsService.copyPageWithNewId('base', newSheetName);
            console.log(`line 14 in shippinglabelcontroller -> finished copyPageWithNewId`)

            return result; // Return the new sheet name
            // res.status(200).json({ message: `new Shipping label created with ID: ${newSheetName}` });

        } catch (error) {
            console.error('Error creating new page:', error.message);
            throw error;
        }
    }

    async createNewShippingLabel(req, res) {
        try {
            const result = await this.createNewPageFromBase();
            const palletData = req.body; // Array of pallet data sent in the request body
            console.log(`created new sheet: ${result['name']}, now trying to input ${palletData}`)
            // Now call the service to write this data to the new sheet
            const success = await shippingLabelsService.writeShippingDataToSheet(result['name'],result['id'], palletData);
            
            res.status(200).json({ 'success': true, result, success});
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    }
    
}

module.exports = new ShippingLabelsController();
