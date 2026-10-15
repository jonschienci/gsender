// Delayed commands belong to one connection lifetime. Closing a controller
// cancels them; reopening must never replay reset, unlock or override bytes.
export default class ConnectionTasks {
	constructor(getConnection) {
		this.getConnection = getConnection;
		this.pending = new Set();
		this.generation = 0;
	}

	schedule(callback, milliseconds) {
		const connection = this.getConnection();
		if (!connection?.isOpen()) return;
		const generation = this.generation;
		const timer = setTimeout(() => {
			this.pending.delete(timer);
			if (generation !== this.generation ||
				this.getConnection() !== connection || !connection.isOpen()) return;
			callback(connection);
		}, milliseconds);
		this.pending.add(timer);
	}

	cancel() {
		this.generation++;
		for (const timer of this.pending) clearTimeout(timer);
		this.pending.clear();
	}
}
