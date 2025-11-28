import { Env, Message } from '../types/env';

export interface VectorMetadata {
    userId: string;
    messageId?: string;
    type: 'conversation' | 'knowledge' | 'task';
    timestamp: number;
    content: string;
}

export interface SearchResult {
    id: string;
    score: number;
    metadata: VectorMetadata & Record<string, any>;
    vector?: number[];
}

/**
 * Vectorize integration for semantic memory and RAG
 */
export class VectorizeManager {
    private env: Env;

    constructor(env: Env) {
        this.env = env;
    }

       /**
       * Convert our application metadata to Vectorize-compatible format
       */
      private toVectorizeMetadata(metadata: VectorMetadata): Record<string, string | number | boolean | string[]> {
          return {
              userId: metadata.userId,
              messageId: metadata.messageId || '',
              type: metadata.type,
              timestamp: metadata.timestamp,
              content: metadata.content,
          };
      }

      /**
       * Convert Vectorize metadata back to our application format
       */
      private fromVectorizeMetadata(raw: Record<string, unknown>): VectorMetadata & Record<string, any> {
          const base: VectorMetadata = {
              userId: raw.userId as string,
              messageId: raw.messageId as string | undefined,
              type: raw.type as 'conversation' | 'knowledge' | 'task',
              timestamp: raw.timestamp as number,
              content: raw.content as string,
          };

          
          const additional: Record<string, any> = {};
          for (const [key, value] of Object.entries(raw)) {
              if (!['userId', 'messageId', 'type', 'timestamp', 'content'].includes(key)) {
                  additional[key] = value;
              }
          }

          return { ...base, ...additional };
      }

    /**
     * Generate embeddings
     */
    async generateEmbedding(text: string): Promise<number[]> {
        try {
            const response = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
                text: [text],

            }) as { data: number[][] };

            if (!response.data || response.data.length === 0) {
                throw new Error(' No embedding generated');
            }
            
            return response.data[0];
        } catch (error) {
            console.error('Error generating embedding:', error);
            throw error;
        }
    }

    /**
     * Store a message embedding
     */
    async storeMessageEmbedding(
        userId: string,
        message: Message,
        type: 'conversation' | 'knowledge' | 'task' = 'conversation'
    ): Promise<boolean> {
        try {
        const embedding =  await this.generateEmbedding(message.content);

        const appMetadata: VectorMetadata = {
            userId,
            messageId: message.id,
            type,
            timestamp: message.timestamp,
            content: message.content.substring(0, 500)
        };

        const vectorizeMetadata = this.toVectorizeMetadata(appMetadata);
        await this.env.VECTORIZE.upsert([
          {
            id: message.id,
            values: embedding,
            metadata: vectorizeMetadata,
          },
        ]);
        console.log("Stored embedding for message:", message.id);
        return true;
    } catch (error) {
        console.error('Error storing message embedding:', error);
        return false;
    }
    }

    /**
     * Store custom knowledge entry with embedding
     */
    async storeKnowledge(
        userId: string,
        id: string,
        content: string,
        additionalMetadata?: Record<string, string | number>
    ): Promise<void> {
        try {
            const embedding = await this.generateEmbedding(content);

            const appMetadata: VectorMetadata = {
                userId,
                type: 'knowledge',
                timestamp: Date.now(),
                content: content.substring(0, 500),
            };

            const vectorizeMetadata = {
                ...this.toVectorizeMetadata(appMetadata),
                ...additionalMetadata,
            };

            await this.env.VECTORIZE.upsert([
                {
                    id,
                    values: embedding,
                    metadata: vectorizeMetadata,
                },
            ]);
            console.log("Stored knowledge embedding:", id); 
        } catch (error) {
            console.error('Error storing knowledge embedding:', error);
        }
    }

    /**
     * Semantic search for relevant context (RAG)
     */
    async searchRelevantContext(
        userId: string,
        query: string,
        topK: number = 5,
        filter?: { type?: 'conversation' | 'knowledge' | 'task' }
    ): Promise<SearchResult[]> {

        try{
            const queryEmbedding = await this.generateEmbedding(query);

            const vectorFilter: Record<string, string> = { userId };
            if (filter?.type) {
                vectorFilter.type = filter.type;
            }

            const results = await this.env.VECTORIZE.query(queryEmbedding, {
                topK,
                filter: vectorFilter,
                returnValues: false,
                returnMetadata: true,
            });

            return results.matches.map(match => ({
                id: match.id,
                score: match.score,
                metadata: this.fromVectorizeMetadata(match.metadata || {}), 
            }));
        } catch (error) {
            console.error('Error searching relevant context:', error);
            return [];
        }
    }

    /**
     * Retrieve relevant knowledge entries for RAG
     */
    async getRelevantKnowledge(
        userId: string,
        query: string,
        topK: number = 3
    ): Promise<string[]> {
        const results = await this.searchRelevantContext(userId, query, topK, { type: 'knowledge' });

        return results
            .filter(r => r.score > 0.75)
            .map(r => r.metadata.content);
    }

    /**
     * Retrieve relevant conversation history for RAG
     */
    async getRelevantHistory(
        userId: string,
        currentMessage: string,
        topK: number = 3,
    ): Promise<string[]> {
        const results = await this.searchRelevantContext(userId, currentMessage, topK, { type: 'conversation' });
        
        return results
            .filter(r => r.score > 0.75)
            .map(r => r.metadata.content);
    }

     /**
       * Delete embeddings by IDs
       */
      async deleteEmbeddings(messageIds: string[]): Promise<void> {
          try {
              await this.env.VECTORIZE.deleteByIds(messageIds);
              console.log(`Deleted ${messageIds.length} embeddings`);
          } catch (error) {
              console.error('Error deleting embeddings:', error);
          }
      }

      /**
       * Batch store multiple message embeddings
       */
      async batchStoreEmbeddings(
        userId: string,
        messages: Message[],
        type: 'conversation' | 'knowledge' | 'task' = 'conversation'
      ): Promise<void> {

        try {
            const embeddingPromises = messages.map(msg => this.generateEmbedding(msg.content));

            const embeddings = await Promise.all(embeddingPromises);

            const vectors = messages.map((msg, index) => {
                const appMetadata: VectorMetadata = {
                    userId,
                    messageId: msg.id,
                    type,
                    timestamp: msg.timestamp,
                    content: msg.content.substring(0, 500),
                };

                return {
                    id: msg.id,
                    values: embeddings[index],
                    metadata: this.toVectorizeMetadata(appMetadata),
                };
            });

            const BATCH_SIZE = 100;
            for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
                const batch = vectors.slice(i, i + BATCH_SIZE);
                await this.env.VECTORIZE.upsert(batch);
            }

            console.log(`Stored ${messages.length} embeddings in batch`);
        
        
        
        } catch (error) {
            console.error('Error batch storing embeddings:', error);
            throw error;
        }
    }

}