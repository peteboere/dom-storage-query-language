/**

DOM Storage Query Language
A SQL inspired interface for working with DOM Storage

*/
(function () {

if ( !( 'localStorage' in window ) ) {
	return;
}

// Helpers
var inArray = function ( obj, arr ) { 
		for ( var i = 0; i < arr.length; i++ ) {
			if ( arr[i] === obj ) {
				return true;
			} 
		} 
		return false;
	},
	toArray = function ( obj ) {
		var result = [], n = obj.length, i = 0;
		for ( i; i < n; i++ ) { 
			result[i] = obj[i]; 
		}
		return result;
	},
	each = function ( obj, callback ) {
		if ( {}.toString.call( obj ) === '[object Object]' ) {
			for ( var key in obj ) { 
				callback.call( obj, key, obj[ key ] ); 
			}
		}
		else if ( obj.length ) {
			for ( var i = 0; i < obj.length; i++ ) { 
				callback.call( obj, obj[ i ], i ); 
			}
		}		
	},
	keys = function ( obj ) {
		var result = [], key;
		for ( key in obj ) {
			if ( obj.hasOwnProperty( key ) ) {
				result.push( key );
			}
		}
		return result;
	},
	extractLiterals = function ( str, prefix ) {
		var literals = {}, 
			prefix = prefix || 'LIT',
			counter = 0,
			label,
			m; 
		while ( m = /('|")(?:\\1|[^\1])*?\1/.exec( str ) ) {	
			label = '_' + prefix + ( ++counter ) + '_';
			literals[ label ] = m[0].substring( 1, m[0].length-1 );
			str = str.substring( 0, m.index ) + label + str.substring( m.index + m[0].length );
		}
		return {
			string: str,
			literals: literals,
			prefix: prefix,
			match: function ( test ) {
				if ( test in literals ) {
					var value = literals[ test ];
					delete literals[ test ];
					return value;
				} 
				return test;
			}
		};
	},

// Shortcuts
	win = window,
	local = win.localStorage,
	// Throws an error in FF if you try to access offline 
	session = function () {
		try { return win.sessionStorage }
		catch ( ex ) { return {}; }
	}(),

	// Default to localStorage
	_defaultStorage = 'local',
	
	_currentTable = null,
	
	_data = {
		local: local.DomSQL ? JSON.parse( local.DomSQL ) : {tables:{}},
		session: session.DomSQL ? JSON.parse( session.DomSQL ) : {tables:{}}
	},
	
	// Parse a path argument, i.e 'local.foo'
	_getPath = function ( path ) {
		var parts = path.split( '.' ),
			storage = _defaultStorage,
			table = parts[0];
		if ( parts.length > 1 ) {
			storage = parts[0];
			table = parts[1];
		}		
		return { storage: storage, table: table };
	},
	
	// Map path argument to a table object, also for creating new table objects
	_getTable = function ( path, createIfNotExist ) {
		var path = _getPath( path );
		_currentTable = _data[ path.storage ].tables[ path.table ];
		if ( !_currentTable && createIfNotExist ) {
			_currentTable = _data[ path.storage ].tables[ path.table ] = {rows:_createDataset(),fields:{},auto_inc:0};
		}
		else {
			_createDataset( _currentTable.rows );
		}
		return _currentTable;
	},
	
	// Serialize and store data
	_commit = function () {
		local.DomSQL = JSON.stringify( _data.local );
		session.DomSQL = JSON.stringify( _data.session );
	},
	
	// Create hash of reserved keywords and compiled RegEx patterns
	_keywords = function () {
		var res = {};
		each( 'SELECT,ORDERBY,DESC,ASC,INSERT INTO,UPDATE,SET,WHERE,AND,OR,DELETE FROM,LIMIT,VALUES'.
			split(','), function ( it ) {
			res[ it ] = new RegExp( '(^|\\b)'+it+'($|\\b)', 'gi' );
		});
		return res;
	}(),
	
	// Normalize passed in argument
	_parseQuery = function ( dql ) {
		var extract = extractLiterals( dql ),
			dql = extract.string.
				// Remove space around modifiers
				replace( /\s*([^a-z0-9_()* ]+)\s*/gi, '$1' ).
				// Add delimiters around operators
				replace( /([!=<>]+)/gi, '#$1#' ).
				// Remove braces
				replace( /(\()\s*|\s*(\))/g, '$1$2' ).
				// Remove double spaces
				replace( /\s+/g, ' ' ).
				// Trim
				replace( /^\s+|\s+$/, '' );
		// Uppercase keywords and convert spaces to underscores
		each( _keywords, function ( keyword, patt ) {
			var m = patt.exec( dql );
			patt.lastIndex = 0
			if ( m ) {
				dql = dql.substring( 0, m.index ) + 
					m[0].toUpperCase().replace( /\s/g, '_' ) + 
					dql.substring( m.index + m[0].length );
			}
		});
		return {
			extract: extract,
			tokens: dql.split( ' ' )
		}; 
	},
	
	_comp = {
		'=' : function ( a, b ) { return a == b; }, 
		'>' : function ( a, b ) { return a > b; },
		'>=' : function ( a, b ) { return a >= b; },
		'<' : function ( a, b ) { return a < b; },
		'<=' : function ( a, b ) { return a <= b; },
		'!=': function ( a, b ) { return a != b; }
	},
	
	// Evaluate WHERE/AND/OR clauses, handle nested expressions
	_evalWhere = function ( clause, row, feed ) {
		var evaluate = function ( str ) {
			var tokens = str.split( ' ' );
			for( var i = 0; i < tokens.length; i++ ) {
				var logicalNext = tokens[ i+1 ],
					result = tokens[i];
				if ( /^[01]$/.test( result ) ) {
					result = +result;
				}
				else {	
					var	parts = tokens[i].split( '#' );					
					// Restore literals
					parts[2] = feed.extract.match( parts[2] ); // ['id', '<', '123']
					// Do comparison
					result = _comp[ parts[1] ]( row[ parts[0] ], parts[2] );
				}
				// Success 
				if ( result && ( !logicalNext || logicalNext === 'OR' ) ) {
					return true;
				}
				// Fail
				if ( !result && ( !logicalNext || logicalNext === 'AND' ) ) {
					return false;
				}
				if ( logicalNext ) {
					i++;
				} 
			}
		};
		// Deal with braced expressions
		if ( clause.indexOf( '(' ) !== -1 ) { 		
			var parensPatt = /\(([^\)]+)\)/g, m;			
			while ( clause.indexOf( '(' ) !== -1 ) {
				parensPatt.lastIndex = clause.lastIndexOf( '(' );
				m = parensPatt.exec( clause );
				clause = clause.substring( 0, m.index ) + 
					// Cast result to 1 or 0 
					( +evaluate( m[1] ) ) + 
					clause.substring( m.index + m[0].length ); 
			}
		}
		return evaluate( clause );
	},
	
	// If a table schema is defined, make rows comply to it
	_validateRow = function ( row ) {
		var fields = _currentTable.fields;
		// If no fields are defined in the schema, just return the row
		if ( !keys( fields ).length ) { 
			return row;
		}
		// Schema defined fields
		each( fields, function ( field, meta ) {
			// Schema fields with attributes 
			if ( keys( meta ).length ) {
				each( meta, function ( attr, value ) {
					if ( value ) {
						row[ field ] = function () {
							switch ( attr ) {
								case 'auto_inc': return ++_currentTable.auto_inc;
								case 'timestamp': return +(new Date);
								case 'def': 
									if ( !( field in row ) ) {
										return value;
									}
							}
						}();					
					}
				});
			}
			// If a schema field has no attributes and has not been given a value
			else if ( !( field in row ) ) {
				row[ field ] = null;
			}
		});
		// Delete rows that are not defined in the schema
		each( row, function ( name ) {
			if ( !( name in fields ) ) {
				delete row[ name ];
			}			
		}); 
		return row;
	},
	
	// Sugar for handling result sets
	_sugarMethods = {
		each: function ( func ) {
			return each( this, func );
		},
		toString: function () {
			var out = [];
			each( this, function ( row, i ) {
				out.push( '[' + i + ']' );
				each( row, function ( field, value ) {
					out.push( '\t' + field + ':' );
					out.push( '\t  ' + value );
				});
			});
			return out.join( '\n' );
		},
		log: function() {
			if ( console ) {
				// IE doesn't override toString method
				console.log( _sugarMethods.toString.call( this ) );
			}
		}
	},
	
	// Binds sugar methods to datasets and optionally creates them
	_createDataset = function ( rows ) {
		var dataset = rows || [];
		each( _sugarMethods, function ( name, method ) {
			dataset[ name ] = method;	
		});
		return dataset;
	},
	
	_commandParsers = {
		
		'SELECT': function ( feed ) {
			var tokens = feed.tokens,
				rows = _currentTable.rows,
				fields = feed.args === '*' ? '*' : feed.args.split( ',' ),
				result = [],
				i = 0;
				
			// WHERE
			each( _currentTable.rows, function ( row ) {
				if ( !feed.where || _evalWhere( feed.where, row, feed ) ) {
					result.push( row );
				}
			});
			// ORDERBY
			if ( tokens[0] === 'ORDERBY' ) {
				tokens.shift(); 
				var args = tokens.shift().split( ',' ),
					index = 0,
					sortKind = 'ASC',
					sortComp = {
						'ASC': function ( a, b ) { return a[ args[ index ] ] > b[ args[ index ] ]; },
						'DESC': function ( a, b ) { return a[ args[ index ] ] < b[ args[ index ] ]; }
					},
					sorter = function ( a, b ) {
						if ( a[ args[ index ] ] === b[ args[ index ] ] ) { 
							if ( args[ index+1 ] ) {
								index++;
								return sorter( a, b );
							}
							index = 0;
							return 0; 
						} 
						var result = sortComp[ sortKind ]( a, b ) ? 1 : -1;
						index = 0;
						return result;
					};
				if ( tokens[0] in sortComp ) {
					sortKind = tokens.shift();
				}
				result.sort( sorter );
			}
			// LIMIT
			if ( tokens[0] === 'LIMIT' ) {
				tokens.shift();
				result = result.slice( 0, tokens.shift() );
			}
			// Truncate returned fields
			if ( fields !== '*' ) {
				each( result, function ( row ) {
					for ( field in row ) {
						if ( !inArray( field, fields ) ) {
							delete row[ field ];
						}				
					} 
				});
			}
			return _createDataset( result );
		},
		
		'DELETE_FROM': function ( feed ) {
			var dataset = _currentTable.rows;
			each( dataset, function ( row, i ) {
				if ( !feed.where || _evalWhere( feed.where, row, feed ) ) {
					dataset.splice( i, 1 );
				}
			});
			_commit();
			return dataset;
		},
		
		'UPDATE': function ( feed ) {
			feed.tokens.shift();
			var dataset = _currentTable.rows,
				updates = function () {
					var result = {};
					each( feed.tokens.shift().split( ',' ), function ( part ) {
						var parts = part.split( '#' );
						result[ parts[0] ] = feed.extract.match( parts[2] ); 
					});
					return result;
				}();
			each( dataset, function ( row ) {
				if ( !feed.where || _evalWhere( feed.where, row, feed ) ) {
					each( updates, function ( name, value ) {
						row[ name ] = value;
					});
				} 
			});
			_commit();
			return dataset;
		},
		
		'INSERT_INTO': function ( feed ) {
			var fields = feed.tokens.shift().replace( /[()]/g, '' ).split( ',' ),
				values = feed.tokens.pop().replace( /[()]/g, '' ).split( ',' ), 
				dataset = _currentTable.rows,
				row = {};
			// Restore any literal values
			each( fields, function ( field, i ) {
				row[ field ] = feed.extract.match( values[i] );
			});
			dataset.push( _validateRow( row ) );
			_commit();
			return dataset;
		}
	};


// Public methods
win.DomSQL = {
	
	// Define a table schema, if table is already defined does nothing
	defineTable: function ( path, fields ) {
		if ( this.tableExists( path ) ) {
			return;			
		}
		// Create empty table
		_getTable( path, true );
		// Loop table schema
		each( fields || [], function ( field ) {
			var extract = extractLiterals( field ),
				parts = extract.string.replace( /\s*([=])\s*/gi, '$1' ).split( ' ' ),
				field = _currentTable.fields[ parts.shift() ] = {};
			parts.each( function ( part ) {
				var tokens = part.split( '=' ),
				 	keyword = tokens[0].toLowerCase(),
					value = extract.match( tokens[1] );
				switch ( keyword ) {
					case 'auto_inc': 
						field.auto_inc = true;
						break;
					case 'timestamp': 
						field.timestamp = true;
						break;
					case 'default': 
						field.def = value;
				}
			});
		});
		_commit();
	},
	
	tableExists: function ( tableName ) {
		return !!_getTable( tableName );
	},
	
	showTables: function () {
		var out = [];
		out.push( '[local]' );
		each( _data.local.tables, function ( table ) {
			out.push( '\t' + table );
		}); 
		out.push( '[session]' );
		each( _data.session.tables, function ( table ) {
			out.push( '\t' + table );
		});
		return out.join( '\n' );
	},
	
	dropTable: function ( path ) {
		var path = _getPath( path );
		delete _data[ path.storage ].tables[ path.table ];
		_commit();
	},
	
	// Convenient alternative for stuffing data into tables
	insert: function ( tableName, args ) {
		var args = toArray( arguments ),
			row;
		args.shift();
		_getTable( tableName, true );
		while( row = args.shift() ) { 
			_currentTable.rows.push( _validateRow( row ) );
		}
		_commit();
	},
	
	query: function ( dql ) {
		var feed = _parseQuery( dql ),
			tokens = feed.tokens,
			command = tokens.shift();
		if ( command === 'SELECT' ) {
			feed.args = tokens.shift();
			tokens.shift();
		}	
		_getTable( tokens.shift(), true );
		// Extract WHERE/AND/OR clauses 
		var where = [],	i = 0, token;
		for ( i; i < tokens.length; i++ ) {
			if ( tokens[i] === 'WHERE' ) {
				tokens.splice( i, 1 );
				// 'id<123' 'AND' 'some=12'
				// 'id<123' 'AND' 'some=12' 'orderby' 'date' 'asc' 'limit' '10'
				while ( token = tokens.splice( i, 1 )[0] ) {
					where.push( token );					
					if ( tokens[0] && /^(ORDERBY|LIMIT)$/.test( tokens[0] ) ) {
						break;
					}
				}
				break;
			}
		}
		feed.where = where.join( ' ' );
		return _commandParsers[ command ]( feed );
	},
	
	useLocal: function () {
		_defaultStorage = 'local';
	},
	
	useSession: function () {
		_defaultStorage = 'session';
	}
};

})();	