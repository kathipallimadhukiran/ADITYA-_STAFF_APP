export const mongoConfig = {
  uri: process.env.MONGODB_API_URL,
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
}; 