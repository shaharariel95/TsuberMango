// sheetModel.js
class SheetModel {
    constructor(shipmentDate, cardId, harvestDate, palletNumber, kind, size, boxes, weight, destination) {
        this.validate(harvestDate, palletNumber, boxes, kind,  size);
        
        this.shipmentDate = shipmentDate || '';
        this.cardId = cardId || '';
        this.harvestDate = harvestDate;
        this.palletNumber = palletNumber;
        this.kind = kind;
        this.size = size;
        this.boxes = boxes;
        this.weight = weight || '';
        this.destination = destination || '';
    }

    validate( harvestDate, palletNumber, boxes, kind, size) {
        const required = {harvestDate, palletNumber, boxes, kind, size };
        const missing = Object.entries(required)
            .filter(([_, value]) => !value)
            .map(([key]) => key);

        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
    }

    toArray() {
        return [
            this.shipmentDate,
            this.cardId,
            this.harvestDate,
            this.palletNumber,
            this.kind,
            this.size,
            this.boxes,
            this.weight,
            this.destination,
        ];
    }
}

module.exports = SheetModel;