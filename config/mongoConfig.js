import env from './env';

export const mongoConfig = {
  uri: env.MONGODB_API_URL,
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
}; 