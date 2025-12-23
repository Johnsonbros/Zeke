# Instacart Developer Platform Integration

**Status**: Planned for ZEKE v2  
**Last Updated**: December 2024  
**Priority**: Phase 4 - Advanced Features

---

## Overview

The Instacart Developer Platform (IDP), launched March 2024, provides a public REST API that enables third-party apps to integrate grocery ordering and same-day delivery. This document outlines the integration plan for connecting ZEKE's grocery list to Instacart's auto-buy capabilities.

## Why Instacart?

| Platform | Public API | Auto-Order | Coverage |
|----------|-----------|------------|----------|
| **Instacart** | Yes | Yes | 85,000+ stores, 1,500+ retail banners |
| Amazon Fresh | No | Private partnerships only | Limited |
| Walmart | No | No public API | N/A |

Instacart is the only major grocery platform with a publicly available ordering API.

---

## API Capabilities

### Core Features
- **Product Catalog**: Access to 1B+ products with nutrition info, ingredients, sizes
- **Real-time Inventory**: Check what's on shelves at local retailers
- **Cart Building**: Add items, manage quantities, adjust carts via REST API
- **Checkout**: In-app checkout OR redirect to Instacart marketplace
- **Fulfillment**: Same-day delivery in as fast as 30 minutes
- **Order Tracking**: Real-time delivery updates and replacement alerts

### Monetization
- Affiliate commissions available for orders placed through integration

---

## ZEKE Integration Architecture

### User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ZEKE Grocery List                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  [ ] Milk (Dairy)                                        │   │
│  │  [ ] Eggs x1 dozen (Dairy)                               │   │
│  │  [ ] Bread (Bakery)                                      │   │
│  │  [ ] Chicken breast (Meat)                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  Send via SMS    │  │  Order with      │                    │
│  │                  │  │  Instacart       │                    │
│  └──────────────────┘  └────────┬─────────┘                    │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Instacart Integration Flow                       │
│                                                                 │
│  1. Map ZEKE items → Instacart products (fuzzy matching)        │
│  2. Check availability at preferred retailer                    │
│  3. Build cart with quantities                                  │
│  4. Present checkout options:                                   │
│     - Review & confirm in ZEKE                                  │
│     - Redirect to Instacart app/web                             │
│  5. Track order status → Push notifications                     │
└─────────────────────────────────────────────────────────────────┘
```

### Data Model Extensions

```typescript
// New table: instacart_product_mappings
interface InstacartProductMapping {
  id: string;
  groceryItemName: string;      // "milk", "eggs", etc.
  instacartProductId: string;   // Instacart's product ID
  retailerId: string;           // Preferred store
  lastVerified: Date;
  confidence: number;           // Match confidence 0-1
}

// New table: instacart_orders
interface InstacartOrder {
  id: string;
  instacartOrderId: string;
  status: 'pending' | 'confirmed' | 'shopping' | 'delivering' | 'delivered' | 'cancelled';
  items: string[];              // grocery_item IDs
  totalCents: number;
  deliveryWindow: string;
  createdAt: Date;
  updatedAt: Date;
}

// Extension to grocery_items
interface GroceryItemExtension {
  instacartProductId?: string;
  lastOrderedAt?: Date;
  averagePrice?: number;
}
```

---

## Implementation Plan

### Phase 1: API Access & Authentication
1. Apply for Instacart Developer Platform access at https://www.instacart.com/company/partners
2. Obtain API credentials (client_id, client_secret)
3. Implement OAuth 2.0 flow for user authentication
4. Store tokens securely in ZEKE's secrets management

### Phase 2: Product Matching
1. Build fuzzy matching service for ZEKE items → Instacart products
2. Cache product mappings to reduce API calls
3. Allow user to confirm/correct product matches
4. Store preferred products per household

### Phase 3: Cart & Checkout
1. Implement cart building from grocery list
2. Check real-time availability before checkout
3. Handle substitutions and alternatives
4. Implement checkout flow (in-app or redirect)

### Phase 4: Order Management
1. Track order status via webhooks
2. Push notifications for order updates
3. Store order history for analytics
4. Enable re-ordering from past orders

---

## API Reference

### Base URL
```
https://api.instacart.com/v1
```

### Authentication
OAuth 2.0 Bearer token in Authorization header

### Key Endpoints

#### Search Products
```http
GET /catalog/search
?query={search_term}
&zip_code={user_zip}
&retailer_id={preferred_store}
```

Response:
```json
{
  "products": [
    {
      "id": "prod_abc123",
      "name": "Organic Whole Milk",
      "brand": "Horizon",
      "size": "1 gallon",
      "price_cents": 699,
      "in_stock": true,
      "image_url": "https://..."
    }
  ]
}
```

#### Add to Cart
```http
POST /cart/add
Content-Type: application/json

{
  "product_id": "prod_abc123",
  "quantity": 2,
  "retailer_id": "store456"
}
```

#### Create Order
```http
POST /orders/create
Content-Type: application/json

{
  "cart_id": "cart789",
  "delivery_address": {
    "street": "123 Main St",
    "city": "Hull",
    "state": "MA",
    "zip": "02045"
  },
  "delivery_window": "2024-12-24T10:00:00Z"
}
```

#### Order Status Webhook
```http
POST /webhooks/order-status
{
  "order_id": "order123",
  "status": "delivering",
  "eta": "2024-12-24T11:30:00Z",
  "shopper_name": "John"
}
```

---

## Conceptual Implementation

### Server-Side Service

```typescript
// server/services/instacartService.ts

interface InstacartConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

class InstacartService {
  private baseUrl = 'https://api.instacart.com/v1';
  private accessToken: string | null = null;

  constructor(private config: InstacartConfig) {}

  async searchProducts(query: string, zipCode: string): Promise<Product[]> {
    const response = await fetch(
      `${this.baseUrl}/catalog/search?query=${encodeURIComponent(query)}&zip_code=${zipCode}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      }
    );
    const data = await response.json();
    return data.products;
  }

  async buildCartFromGroceryList(items: GroceryItem[], retailerId: string): Promise<Cart> {
    const cartItems = [];

    for (const item of items) {
      const productId = await this.getProductMapping(item.name);
      if (productId) {
        cartItems.push({
          productId,
          quantity: parseInt(item.quantity) || 1
        });
      }
    }

    return this.createCart({ items: cartItems, retailerId });
  }

  async createCheckout(cartId: string, deliveryAddress: Address): Promise<Order> {
    const response = await fetch(`${this.baseUrl}/orders/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cart_id: cartId,
        delivery_address: deliveryAddress
      })
    });
    return response.json();
  }

  private async getProductMapping(itemName: string): Promise<string | null> {
    // Check cache first, then search if not found
    const cached = await db.getInstacartProductMapping(itemName);
    if (cached) return cached.instacartProductId;
    
    const products = await this.searchProducts(itemName, NATE_ZIP_CODE);
    if (products.length > 0) {
      await db.saveInstacartProductMapping(itemName, products[0].id);
      return products[0].id;
    }
    return null;
  }
}

export const instacartService = new InstacartService({
  clientId: process.env.INSTACART_CLIENT_ID!,
  clientSecret: process.env.INSTACART_CLIENT_SECRET!,
  redirectUri: process.env.INSTACART_REDIRECT_URI!
});
```

### API Routes

```typescript
// server/routes.ts additions

app.post('/api/instacart/build-cart', async (req, res) => {
  const { itemIds } = req.body;
  const items = await Promise.all(itemIds.map(id => getGroceryItem(id)));
  const cart = await instacartService.buildCartFromGroceryList(items, PREFERRED_RETAILER);
  res.json({ cart });
});

app.post('/api/instacart/checkout', async (req, res) => {
  const { cartId } = req.body;
  const order = await instacartService.createCheckout(cartId, NATE_ADDRESS);
  res.json({ order });
});

app.post('/api/webhooks/instacart', async (req, res) => {
  // Verify webhook signature
  const { order_id, status, eta } = req.body;
  await updateInstacartOrderStatus(order_id, status, eta);
  
  // Send push notification if delivering
  if (status === 'delivering') {
    await sendPushNotification('Your groceries are on the way!', { eta });
  }
  
  res.json({ received: true });
});
```

### Frontend Integration

```tsx
// Button in grocery.tsx

function InstacartOrderButton({ items }: { items: GroceryItem[] }) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleOrder = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('/api/instacart/build-cart', {
        method: 'POST',
        body: JSON.stringify({ itemIds: items.map(i => i.id) })
      });
      
      // Show cart preview dialog
      // User confirms, then redirect to Instacart checkout
      window.open(response.checkoutUrl, '_blank');
      
      toast({ title: 'Cart ready in Instacart!' });
    } catch (error) {
      toast({ title: 'Failed to connect to Instacart', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={handleOrder} disabled={isLoading || items.length === 0}>
      <ShoppingBag className="w-4 h-4 mr-2" />
      Order with Instacart
    </Button>
  );
}
```

---

## Required Environment Variables

```env
# Instacart API Credentials
INSTACART_CLIENT_ID=your_client_id
INSTACART_CLIENT_SECRET=your_client_secret
INSTACART_REDIRECT_URI=https://your-zeke-domain.com/api/instacart/callback
INSTACART_WEBHOOK_SECRET=webhook_signing_secret

# User Configuration
INSTACART_PREFERRED_RETAILER=store_id_for_preferred_store
INSTACART_DELIVERY_ZIP=02045
```

---

## Resources

- **Official Documentation**: https://docs.instacart.com/developer_platform_api/
- **Partner Application**: https://www.instacart.com/company/partners
- **API Introduction**: https://docs.instacart.com/developer_platform_api/

---

## Launch Partners (Reference)

Companies already integrated with Instacart's Developer Platform:
- New York Times Cooking
- WeightWatchers
- GE Appliances
- eMeals
- Jow
- Foodsmart
- Innit

These provide reference points for integration patterns.

---

## Implementation Notes

1. **Apply Early**: API access requires partner approval, which may take 2-4 weeks
2. **Start with Search**: Product search is the foundation - get matching right first
3. **Cache Aggressively**: Reduce API calls by caching product mappings (they don't change often)
4. **Handle Substitutions**: Users need to approve replacements for out-of-stock items
5. **Test Environment**: Instacart may have sandbox/test environments - confirm during onboarding
6. **Rate Limits**: Check API rate limits and implement appropriate throttling

---

*Document prepared for ZEKE v2 development - December 2024*
