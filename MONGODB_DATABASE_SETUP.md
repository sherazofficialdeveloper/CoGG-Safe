# MongoDB database name

The backend now supports `MONGODB_DB_NAME`. Set it to `sos` in Railway (or the backend `.env`) to make Mongoose use the `sos` database even if the MongoDB URI currently ends with `/test`.

Important: this changes where new data is written; it does not copy old documents from `test` to `sos`. If old data must be preserved, use MongoDB Atlas migration/rename/copy tools before removing the old database.
