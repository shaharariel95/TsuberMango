// palletRecord.js — pallet record model: required-field validation + normalization/boolean coercion before persistence.
class PalletRecord {
    constructor(shipmentDate, cardId, harvestDate, palletNumber, kind, size, boxes, weight, destination, sent, gidon, mark, editedBy, editedAt) {
        this.validate(harvestDate, palletNumber, boxes, kind, size);

        this.shipmentDate = shipmentDate || '';
        this.cardId = cardId || '';
        this.harvestDate = harvestDate;
        this.palletNumber = palletNumber;
        this.kind = kind;
        this.size = size;
        this.boxes = boxes;
        this.weight = weight || '';
        this.destination = destination || '';
        this.sent = !!sent;
        this.gidon = !!gidon;
        this.mark = !!mark;
        this.editedBy = editedBy || '';
        this.editedAt = editedAt || '';
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
}

module.exports = PalletRecord;