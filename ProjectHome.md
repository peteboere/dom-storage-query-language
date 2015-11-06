<font size='3'><b>DOM Storage Query Language (DomSQL)</b> is an SQL inspired interface for DOM Storage (or <a href='http://www.w3.org/TR/webstorage/'>Web Storage</a> as defined in the W3C working draft).</font>

Following the basic theme of SQL, DomSQL simulates a `database.table` type of address system; `local` and `session` map to the `localStorage` and `sessionStorage` native objects respectively and are the database containers to which any number of tables can be bound. With the caveat that browser implementations of Web Storage have a storage limit of currently between 5 and 10mb.


---


## How it works: ##
### Create a table ###
Creating tables can be done dynamically by simply inserting into a new named table, though a stricter approach is to define a table schema manually. This has the advantage of more normalized output - only fields defined in the schema will be stored - and some added features like default values and auto incrementing fields.
```

// Define a table schema
DomSQL.defineTable( 'local.foo', [
   'name',
   'surname',
   'shoesize',
   'race DEFAULT "other"',
   'id AUTO_INC',
   'time TIMESTAMP'
]);

```

### Insert some data ###
Inserting data into tables follows standard SQL conventions, with the addition of a convenience `insert` method.

**Note:** Keywords in statements are not case sensitive, and statements are not white-space sensitive provided all literal string are quoted.
```
DomSQL.query( 
   'insert into local.foo (name, surname, shoesize) '+
   'values (Jack, Jones, 12)' );

// Alternative syntax 
DomSQL.insert( 'local.foo', [{
   name: 'Jack',
   surname: 'Jones',
   shoesize: 11
},{
   name: 'Jack',
   surname: 'James',
   shoesize: 12
},{
   name: 'Jerry',
   surname: 'Springer',
   shoesize: 10
},{
   name: 'Chuck',
   surname: 'Norris',
   shoesize: 14
}]); 
```

### Query data ###
Limited SQL features are supported in query statements, including selecting return fields, nested WHERE/AND/OR, ORDER BY and LIMIT.

Each result set is a JavaScript Array of Object literals, with the addition of some 'sugar' methods.
```
var result = DomSQL.query(
   'SELECT name, surname FROM local.foo '+
   'WHERE shoesize >= 10 AND ( name != "Chuck" OR surname != "Norris" )'+
   'ORDER BY name, shoesize DESC'
);

// Print result to console
result.log();
/*
>>>
[0]
   name: 
      Jack
   surname:
      James
[1]
   name:
      Jack
   surname:
      Jones
[2]
   name:
      Jerry
   surname:
      Springer
*/
```

### Update and delete data ###
Familiar SQL syntax is available for updating and deleting rows of data:
```
DomSQL.query( 'delete from local.foo where surname = ?', ["Springer"] )

DomSQL.query( 'update local.foo set shoesize = 15 where name = :name', { 'name' : "Chuck" } )
```

### Working with result sets ###
Query result sets have some added convenience methods:
```
// Set localStorage as the default database
DomSQL.useLocal();

var query = DomSQL.query( 'select * from foo' );

// Iterate
query.each( function ( row ) {
   //...statements
});

// Send formatted output to console
query.log();

// Invoke custom toString method (Not available in IE)
alert( query );
```


---


## Support: ##
Support for the Web Storage API is [quite strong](http://a.deveria.com/caniuse/#namevalue-storage) encompassing all the latest releases from the main browsers; Internet Explorer, Firefox, Safari, Opera and Chrome.

The `DomSQL` object is not added to the page if web storage is not natively available, so a simple check for support is as simple as:

```
if ( window.DomSQL ) {
   // ...statements
}  
```


---


## Dependencies: ##
This script is standalone, and requires no other JavaScript libraries.


---


## Demonstration: ##
A simple image to data URI converter that uses DomSQL to keep a locally stored record of converted images:<br><a href='http://tools.the-echoplex.net/img-data-uri/'>http://tools.the-echoplex.net/img-data-uri/</a>
