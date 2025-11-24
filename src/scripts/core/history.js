export class HistoryManager {
    constructor(limit = 50) {
        this.limit = limit
        this.stack = []
        this.cursor = -1
    }

    push(snapshot) {
        if (!snapshot) return

        // Remove redo states if we branch from the middle of the stack.
        if (this.cursor < this.stack.length - 1) {
            this.stack = this.stack.slice(0, this.cursor + 1)
        }

        this.stack.push(snapshot)

        if (this.stack.length > this.limit) {
            this.stack.shift()
        }

        this.cursor = this.stack.length - 1
    }

    canUndo() {
        return this.cursor > 0
    }

    canRedo() {
        return this.cursor >= 0 && this.cursor < this.stack.length - 1
    }

    undo() {
        if (!this.canUndo()) return null
        this.cursor -= 1
        return this.stack[this.cursor]
    }

    redo() {
        if (!this.canRedo()) return null
        this.cursor += 1
        return this.stack[this.cursor]
    }

    clear() {
        this.stack = []
        this.cursor = -1
    }
}

