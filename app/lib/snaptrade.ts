import { Snaptrade } from 'snaptrade-typescript-sdk';

let _client: Snaptrade | null = null;

export function getSnapTradeClient(): Snaptrade {
  if (!_client) {
    const clientId = process.env.SNAPTRADE_CLIENT_ID;
    const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
    if (!clientId || !consumerKey) {
      throw new Error('SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY must be set');
    }
    _client = new Snaptrade({ clientId, consumerKey });
  }
  return _client;
}
