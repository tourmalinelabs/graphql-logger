# graphql-logger

Publish parsed express graphql requests

```javascript
import graphqlLogger from 'graphql-logger';
import amqp from 'amqp';
import app from './my-express-app';
import schema from './my-graphql-schema';

const connection = amqp.createConnection();

app.use(graphqlLogger({
  schema,
  connection,
  indexPrefix: 'logstash',
  indexInterval: 'weekly',
  disableLists: false,
  disableResponseData: false,
}));
```
