export class CrmTransactionAbort extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = "CrmTransactionAbort";
    this.status = status;
    this.details = details;
  }
}

export async function withCrmTransaction(pool, operation, emitEvent) {
  const connection = await pool.getConnection();
  const events = [];
  let committed = false;

  try {
    await connection.beginTransaction();

    const result = await operation({
      connection,
      queueEvent: (...args) => {
        events.push(args);
      }
    });

    await connection.commit();
    committed = true;

    // Eventos nunca devem provocar rollback apos commit.
    for (const args of events) {
      try {
        emitEvent?.(...args);
      } catch (error) {
        console.error("CRM event after commit:", error);
      }
    }

    return result;
  } catch (error) {
    if (!committed) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("CRM rollback failed:", rollbackError);
      }
    }

    throw error;
  } finally {
    connection.release();
  }
}
