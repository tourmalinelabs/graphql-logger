# graphql-logger

Records a parsed graphql request onto the express request object.

```javascript
import graphqlLogger from 'graphql-logger';
import app from './my-express-app';
import schema from './my-graphql-schema';

app.use(graphqlLogger({
  schema,
  onFinish: (req, res) => {
    console.log(req.graphqlTree);
  },
  disableLists: false,
  disableResponseData: false,
}));
```
