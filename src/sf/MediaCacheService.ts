class MediaCacheService {
  publicCacheFolder: string;
  privateCacheFolder: string;
  private queueTimeout: NodeJS.Timeout;

  constructor() {
    this.publicCacheFolder = "./cache/public";
    this.privateCacheFolder = "./cache/private";
    this.queueTimeout = setInterval(this.processQueue, 1000);
  }
  
  async queue(url, options: {
    ttl?: number;
    // Mime type with params
    reencode: string;
    // Notes to store about this particular cache, will be stored to the cache_log, not directly to the cache, so we have consistency
    metadata?: Record<string, any>;

  }) {

    
  }

  async processQueue() {

  }

  async getByUrl(url: string) {
    return null;
  }
  
  async getById(id: string) {
    return null;
  }


}

class MediaCacheEntry {
  id: string
  url: string
  metadata: Record<string, any>;
}

export default new MediaCacheService();
