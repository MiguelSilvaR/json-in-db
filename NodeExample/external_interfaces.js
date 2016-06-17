var http = require('http');
var url = require('url');
var cfg = require('./config.js');
var xmlParser = require('xml2js').Parser();
var movieAPI = require('./movie_ticket_api.js');

module.exports.ExternalError   = ExternalError;
module.exports.loadTheaters    = loadTheaters;
module.exports.loadMovies      = loadMovies;
module.exports.loadScreenings  = loadScreenings;
module.exports.loadPosters     = loadPosters;
module.exports.showCompanyList = showCompanyList;

function ExternalError(details) {
  this.name    = 'ExternalError';
  this.message = 'Unexpected error while accessing external data source:';
  this.stack   = details.cause.stack;
  this.details = details
}

ExternalError.prototype = Object.create(Error.prototype);
ExternalError.prototype.constructor = ExternalError;

// var engagementStartDate = new Date(cfg.dataSources.engagementStartDate)
// var engagementEndDate = new Date(cfg.dataSources.engagementEndDate)

var disableSodaLogging = { sodaLoggingEnabled : false };
var sodaLoggingState    = disableSodaLogging;

function dateWithTZOffset(date) {
  var tzo = -date.getTimezoneOffset()
   var dif = tzo >= 0 ? '+' : '-'
   var pad = function(num) {
     var norm = Math.abs(Math.floor(num));
     return (norm < 10 ? '0' : '') + norm;
   };
 
   return date.getFullYear() 
       + '-' + pad(date.getMonth()+1)
       + '-' + pad(date.getDate())
       + 'T' + pad(date.getHours())
       + ':' + pad(date.getMinutes()) 
       + ':' + pad(date.getSeconds()) 
       + dif + pad(tzo / 60) 
       + ':' + pad(tzo % 60);
}

function getRandomBetweenValues(low,high) {
  return Math.floor(Math.random() * (high-low) + low);
}	

function loadTheaters (sessionState, response, next) {

  /* Disable Soda Logging */
  
  var sessionState = sodaLoggingState;

  var theaterList = [];
  
  console.log('externalInterface.loadTheaters()');
  getTheaterInformation().then(function(theaters) {
  	theaterList = theaters;
    return movieAPI.recreateTheaterCollection(sessionState)
  }).then(function() {
    return movieAPI.insertTheaters(sessionState, theaterList);
  }).then(function(sodaResponse) {
    response.json({count:sodaResponse.json.length})
    response.end('')
  }).catch(function(e) {
    next(e)
  });
} 

function loadMovies(sessionState, response, next) {

  /* Disable Soda Logging */
  
  var sessionState = sodaLoggingState;

  console.log('externalInterface.loadMovies()');
  getMoviesFromTMDB(sessionState,response).catch(function(e) {
    next(e)
  });

} 

function loadScreenings (sessionState, response, next) {

  /* Disable Soda Logging */
  
  var sessionState = sodaLoggingState;

  console.log('externalInterface.loadScreenings()');
  createScreenings(sessionState).then(function(total) {
    response.json({count:total})
    response.end('')
  }).catch(function(e) {
    next(e)
  });
} 
  
function loadPosters(sessionState, response, next) {

  /* Disable Soda Logging */
  
  var sessionState = sodaLoggingState;

  console.log('externalInterface.loadMovies()');
  getPostersFromTMDB(sessionState,response).catch(function(e) {
    next(e)
  });


}

function getTheaterLocation(geocodeResult) {
      
  var location = geocodeResult.input.address.address    
      
  var city = null;
  var state = null;
  var streetAddress = null;
  var zip = null;
 
  if (geocodeResult.addressMatches.length > 0) {
    var address = geocodeResult.input.address.address
    var streetNumber = address.substring(0,address.indexOf(' '));

    var coordinates = geocodeResult.addressMatches[0].coordinates;
    var addressInfo = geocodeResult.addressMatches[0].addressComponents;
    
    var streetAddress = streetNumber + ' ';
 
    if (addressInfo.preQualifier) {
       streetAddress += addressInfo.preQualifier + ' '
    }
 
    if (addressInfo.preDirection) {
       streetAddress += addressInfo.preDirection + ' '
    }
 
    if (addressInfo.preType) {
       streetAddress += addressInfo.preType + ' '
    }
 
    if (addressInfo.streetName) {
       streetAddress += addressInfo.streetName + ' '
    }
 
    if (addressInfo.suffixType) {
       streetAddress += addressInfo.suffixType + ' '
    }
 
    if (addressInfo.suffixDirection) {
       streetAddress += addressInfo.suffixDirection + ' '
    }
 
    if (addressInfo.suffixQualifier) {
       streetAddress += addressInfo.suffixQualifier + ' '
    }
    
    streetAddress = streetAddress.trim();
    
    if (addressInfo.city) {
       city = addressInfo.city
    }
 
    if (addressInfo.state) {
       state = addressInfo.state
    }
 
    if (addressInfo.zip) {
       zip = addressInfo.zip
    }

    location = {
      street      : streetAddress,
      city        : city,      
      zipCode     : zip,
      state       : state,
      phoneNumber : null,
      geoCoding   : {
        type        : "Point",
        coordinates : [coordinates.x , coordinates.y]                                                                      
      }
    }
             
  return location   
  }
}

function geocodeTheater(theater) {

   return new Promise(
     
     function(resolve, reject) {

      var readResponse = function(response) {
      
        var responseText = '';
        
        response.on(
          'data' ,
           function(chunk) {
            responseText = responseText + chunk;
          }
        )
        
        response.on(
          'end', 
          function () {
            if (response.statusCode == 200) {
              theater.location = getTheaterLocation(JSON.parse(responseText).result);
              resolve(theater)
            }
            else {
              if (response.statusCode == 500) {
                console.log('geocodeTheater().readResponse(): Geocoding Failed (500) for  ' + theater.location)
                resolve(geocodeTheater(theater))
              }
              else {
                var details = { 
                  module         : 'geocodeTheater().readResponse(end)',
                  statusCode     : response.statusCode,
                  statusText     : http.STATUS_CODES[response.statusCode],
                  requestOptions : options,
                  bytesRecieved  : responseText.length,
                  responeText    : responseText,
                  cause          : new Error()
                }
                reject(new ExternalError(details));
              }
            }
          }
        );
      }
    
      // console.log('geocodeTheater() : Location = ' + theater.location);

      var path = cfg.dataSources.usCensus.path 
               + '?' + 'format=' + 'json' 
               + '&' + 'benchmark=' + '9' 
               + '&' + 'address=' + encodeURIComponent(theater.location);

      var options = {} 
      
      if (cfg.dataSources.useProxy) {
        path = cfg.dataSources.usCensus.protocol + '://' + cfg.dataSources.usCensus.hostname + ':' + cfg.dataSources.usCensus.port + path;
        options = {
          hostname : cfg.dataSources.proxy.hostname,
          port     : cfg.dataSources.proxy.port,
          method   : 'GET',
          path     : path,
          headers : {'Content-Type': 'application/json'}
        }
      }
      else {
	      options = {
          hostname : cfg.dataSources.usCensus.hostname,
          port : cfg.dataSources.usCensus.port,
          method : 'GET',
          path : path,
          headers : {'Content-Type': 'application/json'}
        };    
      }
           
      var request = http.request(options, readResponse);

       request.on(
        'error', 
        (e) => {
          var details = { 
            module         : 'geocodeTheater().request(error)',
            requestOptions : options,
            cause          : e
          }
          reject(new ExternalError(details));
        }
      );
      request.end();
    }
  )
}
   
function generateTheater(item, index) {

  return new Promise(
  
    function(resolve, reject) {
      
      // console.log('generateTheater(): Processing Theater #' + index);
      
      var name = item.title[0]
      var screenCount = name.match(/\d+$/);
      
      if (screenCount == null) {
        screenCount = getRandomBetweenValues(8,17)
       }
       var screens = []
       for (var i=0; i<screenCount; i++) {
        screen = {
          id            : i+1,
          capacity      : getRandomBetweenValues(64,129),
            features      : {
             threeD         : false,
             reserveSeats   : false
            },
            ticketPricing : {
              adultPrice    : 14.95,
              childPrice    : 9.95,
              seniorPrice   : 9.95
            }
        }
        screens.push(screen);
      }
      
      var location = item.description[0].substring(3,item.description[0].indexOf('</p>'));

      var theater = {
        id       : index +1,
        name     : name,
        location : location,
        screens  : screens,
      }                         

      resolve(theater)
    }
  )
}

function getTheatersFromFandango() {

  
  return new Promise(
  
    function(resolve, reject) {

      var readResponse = function(response) {
      
      var responseText = '';
        
      response.on(
        'data' ,
         function(chunk) {
            responseText = responseText + chunk;
          }
        )
        
        response.on(
          'end', 
          function () {
            if (response.statusCode == 200) { 
              resolve(responseText)
            }
            else {
              var details = { 
                module : 'getTheatersFromFandango().readResponse(end)',
                statusCode     : response.statusCode,
                statusText     : http.STATUS_CODES[response.statusCode],
                requestOptions : options,
                bytesRecieved  : responseText.length,
                responeText    : responseText,
                cause          : new Error()
              }
              reject(new ExternalError(details));
            }
          }
        );
      }
  
      console.log('getTheatersFromFandango()');

      var path = cfg.dataSources.fandango.path + cfg.dataSources.theaterZipCode + '.rss';

      var options = {} 
      
      if (cfg.dataSources.useProxy) {
      	 path = cfg.dataSources.fandango.protocol + '://' + cfg.dataSources.fandango.hostname + ':' + cfg.dataSources.fandango.port + path;
         options = {
       	   hostname : cfg.dataSources.proxy.hostname,
	         port     : cfg.dataSources.proxy.port,
	         method   : 'GET',
	         path     : path,
	         headers : {'Content-Type': 'application/json'}
	       }
      }
      else {
        var options = {
          hostname : cfg.dataSources.fandango.hostname,
          port : cfg.dataSources.fandango.port,
          method : 'GET',
          path : path,
          headers : {'Content-Type': 'application/rss+xml'}
        }
      };    
            
      var request = http.request(options, readResponse);

      request.on(
        'error', 
        (e) => {
          var details = { 
            module         : 'getTheatersFromFandango.request(error)',
            requestOptions : options,
            cause          : e
          }
          reject(new ExternalError(details));
        }
      );
      request.end();
    }
  )   
}
    
function getTheaterInformation() {
  
  // Generate a set of Theater documents from the Fandango TheatersNearMe RSS feed and geocode the results.
  
  return getTheatersFromFandango().then(function(rssFeed) {
    // console.log('loadTheaters(): Count=' + theaters.length);         
    var theaters = []
    xmlParser.parseString(
      rssFeed,
      function(err,jsonRSS) {
        theaters = jsonRSS.rss.channel[0].item
      }         
    );
    return Promise.all(theaters.map(generateTheater))     
  }).then(function(theaters) {
    return Promise.all(theaters.map(geocodeTheater)) 
  })
}

function getTMDBConfiguration() {
  
  console.log('getTMDBConfiguration()');

  return new Promise(
      
    function(resolve, reject) {
                  
      var readResponse = function(response) {
                
        var responseText = '';
        
        response.on(
          'data' ,
           function(chunk) {
            responseText = responseText + chunk;
          }
        );
        
        response.on(
          'end', 
          function () {
            if (response.statusCode == 200) {
              try {
                // console.log('getTMDBConfiguration().readResponse()')
                resolve(JSON.parse(responseText));
              } catch (e) {
                reject(e);
              }
            }
            else {
              var e = { 
                    module : 'getTMDBConfiguration().readResponse(end)',
                    statusCode : response.statusCode,
                    statusText : http.STATUS_CODES[response.statusCode],
                    requestDetails : options,
                    bytesRecieved : responseText.length,
                    responeText : responseText
                  }
              reject(e)
            }
          }
        );
      }
    
      // console.log('Executing Promise[getTMDBConfiguration()]');
  
      var path = cfg.dataSources.tmdb.apiPath + '/configuration'
               + '?' + 'api_key=' + cfg.dataSources.tmdb.apiKey;

      var options = {} 

      if (cfg.dataSources.useProxy) {
        path = cfg.dataSources.tmdb.protocol + '://' + cfg.dataSources.tmdb.hostname + ':' + cfg.dataSources.tmdb.port + path;
        options = {
          hostname : cfg.dataSources.proxy.hostname,
          port     : cfg.dataSources.proxy.port,
          method   : 'GET',
          path     : path,
          headers : {'Content-Type': 'application/json'}
        }
      }
      else {
        options = {
          hostname : cfg.dataSources.tmdb.hostname,
          port     : cfg.dataSources.tmdb.port,
          method   : 'GET',
          path     : path,
          headers : {'Content-Type': 'application/json'}
        }
      };    
  
      var request = http.request(options, readResponse);
      request.on(
        'error', 
        (e) => {
          var details = { 
            module         : 'getTMDBConfiguration().request(error)',
            requestOptions : options,
            cause          : e
          }
          reject(new ExternalError(details));
        }
      );
      request.end();
    }
  )   
}    

function getCastAndCrew(movieId) {
  
  // console.log('getCastAndCrew(' + movieId + ')');

  return new Promise(
      
    function(resolve, reject) {
                  
      var readResponse = function(response) {
          
        var responseText = '';
            
        response.on(
          'data' ,
          function(chunk) {
           responseText = responseText + chunk;
          }
        )
        
        response.on(
          'end', 
          function () {
            if (response.statusCode == 200) {
              try {
                // console.log('getCastAndCrew(' + movieId + ').readResponse()')
                var castAndCrew = JSON.parse(responseText)
                resolve(castAndCrew);
              } catch (e) {
                reject(e);
              }
            }
            else {
              var e = { 
                    module : 'getCastAndCrew(' + movieId + ').readResponse(end)',
                    statusCode : response.statusCode,
                    statusText : http.STATUS_CODES[response.statusCode],
                    requestDetails : options,
                    bytesRecieved : responseText.length,
                    responeText : responseText
                  }
              reject(e)
            }
          }
        )
      }
    
      // console.log('Executing Promise[getMovieList().getCastAndCrew(' + movieId + ')]');
  
      var path = cfg.dataSources.tmdb.apiPath + '/movie/' + movieId + '/casts' 
               + '?' + 'api_key=' + cfg.dataSources.tmdb.apiKey;

      var options = {} 

      if (cfg.dataSources.useProxy) {
        path = cfg.dataSources.tmdb.protocol + '://' + cfg.dataSources.tmdb.hostname + ':' + cfg.dataSources.tmdb.port + path;
        options = {
          hostname : cfg.dataSources.proxy.hostname,
          port     : cfg.dataSources.proxy.port,
          method   : 'GET',
          path     : path,
          headers : {'Content-Type': 'application/json'}
        }
      }
      else {
        options = {
          hostname : cfg.dataSources.tmdb.hostname,
          port     : cfg.dataSources.tmdb.port,
          method   : 'GET',
          path     : path,
          headers : {'Content-Type': 'application/json'}
        }
      };    
  
      var request = http.request(options, readResponse);
      request.on(
        'error', 
        (e) => {
          var details = { 
            module         : 'getCastAndCrew(' + movieId + ').request(error)',
            requestOptions : options,
            cause          : e
          }
          reject(new ExternalError(details));
        }
      );
      request.end();
    }
  )   
}                         

function waitAndRun(items,callback,controllerModuleName,workerModuleName,batchNo,batchSize,response) {
	if (items.length > 0) {
    console.log(new Date().toISOString() + ': ' + controllerModuleName + '(' + batchNo + '): ' + workerModuleName + '(): Waiting.');
    setTimeout(
      function() {   
        console.log(new Date().toISOString() + ':' + controllerModuleName + '(' + batchNo + '): ' + workerModuleName + '(): Running.');
        return callback(items,batchNo,batchSize,response).catch(function(e) {
        	console.log(new Date().toISOString() + ':' + controllerModuleName + '(' + batchNo + '): ' + workerModuleName + '(): Error.');
        	throw e;
        });
      },
      10000
    )
  }
}
    
function getMoviesFromTMDB(sessionState,response) {

  var movies = []
  var movieCache = [];
  
	function fixPosterURL(movie,baseURL) {
		
		if ((movie.posterURL) && (movie.posterURL != null)) {
		  movie.posterURL = baseURL
                      + "w185"
                      + movie.posterURL
                      + '?' + 'api_key=' + cfg.dataSources.tmdb.apiKey;
    }
    
  }

  function processMovies(movieCache) {
  	
  	// Update the Image information and then recreate the Movie Collection.
    
    return getTMDBConfiguration().then(function(configuration) {
      movieCache.forEach(
        function(movie) {
        	fixPosterURL(movie,configuration.images.base_url);
        }
       );
    }).then(function(){
      return movieAPI.recreateMovieCollection(sessionState)
    }).then(function() {
      return movieAPI.insertMovies(sessionState, movieCache);
    }).then(function(sodaResponse) {
      response.write(',');
      response.write('"count":' + sodaResponse.json.length);
      response.write('}');
      response.end();
    }).catch(function(e) {
      console.log('Broken Promise: processMovies().');
      throw e;
    })
  }

  function getCastMembers(castAndCrew) {
    
    var castMembers = []
    try {
      castAndCrew.cast.forEach(
        function(castMember) {
          var newCastMember = {
              name : castMember.name,
              character : castMember.character
          }       
          castMembers.push(newCastMember);
        }
      )
    } catch(e) {
      throw e;
    }
    
    return castMembers      
  }
  
  function getCrewMembers(castAndCrew) {
    
    var crewMembers = []

    try {   
      castAndCrew.crew.forEach(
        function(crewMember) {
          var newCrewMember = {
              name : crewMember.name,
              job : crewMember.job
          }       
          crewMembers.push(newCrewMember);
        }
      )
    } catch(e) {
      throw e;
    }
    
    return crewMembers
  }
      
  function addCastAndCrew(movie) {
    
    return getCastAndCrew(movie.id).then(function(castAndCrew) {
      // console.log('Executing Promise[getMoviesFromTMDB().addCastAndCrew(' + movie.id + ')]');
      movie.crewMember = getCrewMembers(castAndCrew);
      movie.castMember = getCastMembers(castAndCrew);
      movieCache.push(movie);
    }).catch(function (e) {
      console.log('Broken Promise: addCastAndCrew().')
      throw e
    })
  }
  
  function createMovie(tmdbMovie) {

    // console.log('getMoviesFromTMDB().createMovie(' + tmdbMovie.id + ')');
                  	        
    var runtime;
    if (tmdbMovie.runtime) {
    	runtime = tmdbMovie.runtime
    }
    else {
      runtime = getRandomBetweenValues(120,150)
    }

    var movie = {
      id         : tmdbMovie.id,
      title      : tmdbMovie.original_title,
      plot       : tmdbMovie.overview,
      runtime    : runtime,
      posterURL  : tmdbMovie.poster_path,
      castMember : [],
      crewMember : []
    }
    return movie;
  }


  function addMoviePage(pageNo) {
  
    return new Promise(
    
      function(resolve, reject) {
  
        var readResponse = function(response) {
        
        var responseText = '';
          
        response.on(
          'data' ,
           function(chunk) {
              responseText = responseText + chunk;
            }
          )
          
          response.on(
            'end', 
            function () {
              if (response.statusCode == 200) {
                var page = JSON.parse(responseText)
                resolve(page);
              }
              else {                
                var details = { 
                  module         : 'addMoviePage(' + pageNo + ').response(end)',
                  statusCode     : response.statusCode,
                  statusText     : http.STATUS_CODES[response.statusCode],
                  requestOptions : options,
                  bytesRecieved  : responseText.length,
                  responeText    : responseText,
                  cause          : new Error()
                }
                reject(new ExternalError(details));
              }
            }
          );
        }
  
        var path = cfg.dataSources.tmdb.apiPath + '/discover/movie' 
                 + '?' + 'primary_release_date.gte=' + cfg.dataSources.movieStartDate 
                 + '&' + 'primary_release_date.lte=' + cfg.dataSources.movieEndDate 
                 + '&' + 'original_language=' + 'en'
                 + '&' + 'include_adult=' + 'false'
                 + '&' + 'sort_by=' + 'popularity.desc'
                 + '&' + 'api_key=' + cfg.dataSources.tmdb.apiKey
  
        if (pageNo > 0) {
          path = path + '&' + 'page=' + pageNo
        }         
  
        // console.log('addMoviePage(' + pageNo + '): Path=' + path);
        
        var options = {}
        
        if (cfg.dataSources.useProxy) {
           path = cfg.dataSources.tmdb.protocol + '://' + cfg.dataSources.tmdb.hostname + ':' + cfg.dataSources.tmdb.port + path;
           options = {
             hostname : cfg.dataSources.proxy.hostname,
             port     : cfg.dataSources.proxy.port,
             method   : 'GET',
             path     : path,
             headers : {'Content-Type': 'application/json'}
           }
        }
        else {
          options = {
            hostname : cfg.dataSources.tmdb.hostname,
            port     : cfg.dataSources.tmdb.port,
            method   : 'GET',
            path     : path,
            headers : {'Content-Type': 'application/json'}
          };  
        }  

        var request = http.request(options, readResponse);
        request.on(
          'error', 
          (e) => {
            var details = { 
              module         : 'addMoviePage(' + pageNo + ').request(error)',
              requestOptions : options,
              cause          : e
            }
            reject(new ExternalError(details));
          }
        );
        request.end();
      }
    )   
  }

  function addCastAndCrewMembers(movies, batchNo, batchSize,response) {

    batch = movies.splice(0,batchSize)
    // console.log('addCastAndCrewMembers(' + batchNo +',' + batch.length + '): Generating addCastAndCrew() operations.');
  	
    var status = {
      date   : dateWithTZOffset(new Date()),
   	  module : 'addCastAndCrewMembers()',
    	state  : "Processing",
    	batch  : batchNo
    }
    response.write(JSON.stringify(status));
    response.write(',');

    /*
    idList = batch.reduce(
      function(list,movie) {
        list = list + movie.id + ",";
        return list
      },
      ""
    );
    var idList = idList.substring(0,idList.length-1);
    console.log('Adding Batch ' + batchNo + ': [' + idList + '].');
    */
  
    // Create a Batch of addCastAndCrew() operations.
    // console.log('addCastAndCrewMembers(' + batchNo +'): Generating addCastAndCrew operations.');
      
    return Promise.all(batch.map(addCastAndCrew)).then(function(){
    	if (movies.length > 0) {
  	    console.log('addCastAndCrewMembers(' + batchNo + '): Movies remaining = ' + movies.length);
      	batchNo++;
  		  return waitAndRun(movies, addCastAndCrewMembers, 'addCastAndCrewMembers', 'addCastAndCrew', batchNo, batchSize, response);
  		}
	 		else {
        console.log('addCastAndCrewMembers(): addCastAndCrew operations complete');
        var status = {
        date   : dateWithTZOffset(new Date()),
        module : 'addCastAndCrewMembers',
        state  : "Completed"
        }
        response.write(JSON.stringify(status))
        response.write(']');

        console.log('addCastAndCrewMembers(): Movie Cache size = ' + movieCache.length);
        processMovies(movieCache);
      }
    }).catch(function(e){
   	  throw e
    })
  
  }
    
  function removeDuplicates(a){
    a.sort( function(m1,m2) {
     return m1.id - m2.id;
    });
    for(var i = 1; i < a.length; ) {
      if(a[i-1].id == a[i].id) {
        a.splice(i, 1);
      } else {
        i++;
      }
    }
    return a;
  }  

  function addMoviePages(pages, batchNo, batchSize, response) {

		batch = pages.splice(0,batchSize)
    // console.log('addMoviePages(' + batchNo +',' + batch.length + '): Generating addMoviePage() operations.');

    var status = {
        date   :  dateWithTZOffset(new Date()),
        module : 'addMoviePages()',
        state  : "Processing",
        batch  : batchNo
      }
    
    response.write(JSON.stringify(status));
    response.write(',');

    /*
    idList = batch.reduce(
      function(list,movie) {
        list = list + movie.id + ",";
        return list
      },
      ""
    );
    var idList = idList.substring(0,idList.length-1);
    console.log('Adding Batch ' + batchNo + ': [' + idList + '].');
    */
  
    // Create a Batch of addMoviePage() operations.
    // console.log('addMoviePages(' + batchNo +'): Generating addMoviePage() operations.');
      
    return Promise.all(batch.map(addMoviePage)).then(function(tmdbPageContents) {
      tmdbPageContents.forEach(
        function(tmdbPage) {
        	if (tmdbPage.results[0].popularity > 5) {
          	movies.push.apply(movies,tmdbPage.results)
          }
          else {
          	pages = []
          }
        }
      )
    }).then(function(){
    	if (pages.length > 0) {
  	    console.log('addMoviePages(' + batchNo + '): Pages remaining = ' + pages.length);
      	batchNo++;
  		  return waitAndRun(pages, addMoviePages, 'getMoviePages', 'addMoviePages', batchNo, batchSize, response);
  		}
  		else {
  	    console.log('addMoviePages(' + batchNo + '): Processing complete. TMDB format Movie count = ' + movies.length);
  	    
  	    // Remove Duplicates and convert to Oracle Movie Format 
  	    
  	    movies = removeDuplicates(movies);
  	    
  	    movies = movies.map(
  	      function (movie) {
  	      	return createMovie(movie);
  	      }
  	    )
  	    console.log('addMoviePages(' + batchNo + '): Processing complete. Oracle format Movie count = ' + movies.length);
  	     	     
 				return waitAndRun(movies,addCastAndCrewMembers, 'addCastAndCrewMembers','addCastAndCrew',1,batchSize,response);
  		}
    }).catch(function(e){
   	  throw e
    })
  }
  
  function getMoviePages(pages) {
  	
  	var batchSize = 35; 
  		  	
  	if (pages.length > 0) {
  	  return waitAndRun(pages, addMoviePages, 'getMoviePages', 'addMoviePages', 1, batchSize,response);
  	}
  	
  }
  
  console.log('getMoviesFromTMDB()');
 
  return addMoviePage(0).then(function(tmdbPageContent) {
    console.log('getMoviesFromTMDB() : Page Count = ' + tmdbPageContent.total_pages);
    movies.push.apply(movies,tmdbPageContent.results);
    var pages = []      
    for (var i=0; i<tmdbPageContent.total_pages; i++) {   
       pages.push(i+1)
    }
    // Response #1 Open Object, Output key "status" : Start Array
    response.write('{"status":[') 
    return getMoviePages(pages);
  }).catch(function(e) {
    console.log('Broken Promise: getMoviesFromTMDB()');
    throw e;
  });   

}  
   
function generateShowsForScreen(engagementStartDate,engagementEndDate,screen,theaterId,movieId,runtime) {
    
  var shows = []
  
  var screenId = screen.id
  var startTime = getRandomBetweenValues(0,11) * 5;
  var firstShowTime = [12,startTime]

  // console.log('generateShowsForScreen(): screen.id=' + screen.id + '. Showing movie ' + movieId);
  
  // Generate Shows for Each Day of the Engagement.

  var showTime = new Date()
  var tomorrow = new Date()
  showTime.setTime(engagementStartDate.getTime());
  tomorrow.setTime(showTime.getTime() + (24*60*60*1000));
  tomorrow.setHours(0);
  tomorrow.setMinutes(0);
  tomorrow.setSeconds(0);
  
  showTime.setHours(firstShowTime[0])
  showTime.setMinutes(firstShowTime[1])
  showTime.setSeconds(0)
  
  while (showTime < engagementEndDate) {
    // console.log('generateShowsForScreen(): showTime= ' + showTime);
    var show = {
      theaterId      : theaterId,
      movieId        : movieId,
      screenId       : screen.id,
      startTime      : dateWithTZOffset(showTime),
      seatsRemaining : screen.capacity,
      ticketPricing  : screen.ticketPricing,
      seatMap        : screen.seatMap
    }
    showTime.setTime(showTime.getTime() + ((runtime+30)*60*1000));
    showTime.setMinutes(5 * Math.round(showTime.getMinutes()/5));
    shows.push(show)
    if (showTime.getTime() > tomorrow.getTime()) {
      showTime.setTime(tomorrow.getTime());
      showTime.setHours(firstShowTime[0])
      showTime.setMinutes(firstShowTime[1])
      showTime.setSeconds(0)
      tomorrow.setTime(tomorrow.getTime() + (24*60*60*1000));
    }
  } 
  return shows;
}
  
function generateScreeningsForTheater(sessionState,engagementStartDate,engagementEndDate,theater,movies,updatedMovieList) {
  
  var screeningList = []
  
  // console.log('generateScreeningsForTheater() : theater.id=' + theater.id);
  
  return Promise.all(
    // Generate a Array of ShowTimes for each screen within the Theater.
    theater.screens.map(function(screen) {
      // Choose a random Movie for this screen
      var movieIndex = getRandomBetweenValues(0,movies.length);
      var movieItem = movies[movieIndex];
      resetMovieInTheatersFlag(movieItem,true,updatedMovieList)
      return (generateShowsForScreen(engagementStartDate,engagementEndDate,screen,theater.id,movieItem.value.id,movieItem.value.runtime))
    })
  ).then(function(screenings) {
  	// Collapse the array of arrays into a single array
  	screenings.forEach(function(screenings) {
      screenings.forEach(function(screening) {
        screeningList.push(screening);
      })
    })
    // console.log('generateScreeningsForTheater() : Batch Size=' + screeningList.length);
    // Load the Batch of Screenings for the Theater.
    return movieAPI.insertScreenings(sessionState, screeningList);
  })
}

function generateScreenings(sessionState,engagementStartDate,engagementEndDate,theaters,movies,updatedMovieList) {

  console.log('generateScreenings()');

  // console.log('engagementStartDate =' + engagementStartDate);
  // console.log('engagementEndDate = ' + engagementEndDate);
  // console.log('engagementLimit = ' + engagementLimit);

  return Promise.all(
    theaters.map(
      function(theater) {       
        return generateScreeningsForTheater(sessionState,engagementStartDate,engagementEndDate,theater,movies,updatedMovieList);
      }
    )
  )
}

function resetMovieInTheatersFlag(movieItem,state,updatedMovieList) {
	
	// reset the inTheaters flag and add to the list of movies that need updating.
	
	// console.log('resetMovieInTheatersFlag(' + movieItem.value.id + ',' + state + ')');
	if (movieItem.value.inTheaters != state) {
    movieItem.value.inTheaters = state;
    updatedMovieList.push(movieItem);
  }
}                      

function createScreenings(sessionState) {

	var engagementStartDate = new Date();
	engagementStartDate.setDate(engagementStartDate.getDate() - engagementStartDate.getDay());
  engagementStartDate.setHours(0)
  engagementStartDate.setMinutes(0)
  engagementStartDate.setSeconds(0)
  engagementEndDate = new Date();
  engagementEndDate.setDate(engagementStartDate.getDate() + 14);
  engagementEndDate.setHours(0)
  engagementEndDate.setMinutes(0)
  engagementEndDate.setSeconds(0)
  console.log('createScreenings(): Date Range is ' + dateWithTZOffset(engagementStartDate)  + ' thru ' + dateWithTZOffset(engagementEndDate));

  var theaterList = []
  var movieList = []
  var screeningCount = 0;
  var updatedMovieList = [];
  
  return movieAPI.getTheaters(sessionState).then(function(sodaResponse) {
    sodaResponse.json.forEach(
      function(item) {
        theaterList.push(item.value);
      }
    )
  }).then(function() {
    return movieAPI.getMovies(sessionState)
  }).then(function(sodaResponse) {
  	movieList = sodaResponse.json
  	movieList.forEach(
  	  function(movieItem) { 
  	  	resetMovieInTheatersFlag(movieItem,false,updatedMovieList);
  	  }
  	);
  	console.log('createScreenings() : Reset List = ' + updatedMovieList.length);
  	return movieAPI.recreateScreeningCollection(sessionState)
  }).then(function() {
    return generateScreenings(sessionState,engagementStartDate,engagementEndDate,theaterList,movieList,updatedMovieList)
  }).then(function(sodaResponses) {
  	// console.log(JSON.stringify(sodaResponses))
    screeningCount = sodaResponses.reduce(
  	  function (runningTotal,sodaResponse) {
  		  runningTotal = runningTotal + sodaResponse.json.length
  	    return runningTotal
  	  },
  	  0
  	);
  }).then(function(e) {
     console.log('createScreenings() : Reset and Update list = ' + updatedMovieList.length);
  	 return Promise.all(updatedMovieList.map(function(movieItem) {return movieAPI.updateMovie(sessionState, movieItem.id,movieItem.value);}))
  }).then(function() {
  	 return screeningCount;
  }).catch(function(e) {
      console.log('Broken Promise: createScreenings().');
      throw e;
  })     
}

function getMoviePoster(movieId,posterURL) {
  
  // console.log('getMoviePoster(' + movieId + ',' + posterURL + ')');

  return new Promise(
      
    function(resolve, reject) {
                  
      var readResponse = function(response) {
          
        var chunks = [];
            
        response.on(
          'data' ,
          function(chunk) {
           // console.log('getMoviePoster(' + movieId + ',' + posterURL + ').readResponse(data): Processing Chunk');                
           chunks.push(chunk);
          }
        )
        
        response.on(
          'end', 
          function () {
            // console.log('getMoviePoster(' + movieId + ',' + posterURL + ').readResponse(end): StatusCode = ' + response.statusCode);                
            if (response.statusCode == 200) {
              try {
                var content = Buffer.concat(chunks);
                // console.log('getMoviePoster(' + movieId + ',' + posterURL + ').readResponse(end): Chunks read = ' + chunks.length + '. Content length = ' + content.length);
                resolve(content);
              } catch (e) {
                reject(e);
              }
            }
            else {
              var e = { 
                    module : 'getMoviePoster(' + movieId + ',' + posterURL + ').readResponse(end)',
                    statusCode : response.statusCode,
                    statusText : http.STATUS_CODES[response.statusCode],
                    requestDetails : options,
                  }
              reject(e)
            }
          }
        )
      }
    
      // console.log('Executing Promise[getMoviePoster(' + movieId + ',' + posterURL + ')]');
              		
      if (posterURL.indexOf('/movieticket/poster/') == 0) {
      	resolve(null)
      	return;
      }
      
      var options = {} 

      if (cfg.dataSources.useProxy) {
        var path = posterURL;
        options = {
          hostname : cfg.dataSources.proxy.hostname,
          port     : cfg.dataSources.proxy.port,
          method   : 'GET',
          path     : posterURL,
          headers : {'Content-Type': 'application/json'}
        }
      }
      else {
     		var imageURL = url.parse(posterURL);
        options = {
          hostname : imageURL.hostname,
          port     : imageURL.port,
          method   : 'GET',
          path     : imageURL.path,
          headers : {'Content-Type': 'application/json'}
        }
      };    
  
      var request = http.request(options, readResponse);
      request.on(
        'error', 
        (e) => {
          var details = { 
            module         : 'getMoviePoster(' + movieId + ',' + posterURL + ').request(error)',
            requestOptions : options,
            cause          : e
          }
          reject(new ExternalError(details));
        }
      );
      request.end();
    }
  )   
}                         

function getPostersFromTMDB(sessionState,response) {

  var movieItems = [];
  var posterCount = 0;

  
  function getPosterFromTMDB(movieItem) {
 
  	return getMoviePoster(movieItem.id, movieItem.value.posterURL).then(function(poster){
  		if (poster != null) {
        posterCount++;
        // console.log('getPosterFromTMDB() : Poster size = ' + poster.length);
  	    return movieAPI.insertPoster(sessionState, poster).then(function(sodaResponse){
  	    	var movie =  movieItem.value;
  	    	movie.externalURL = movie.posterURL
  	    	movie.posterURL = '/movieticket/poster/' + sodaResponse.json[0].id;
          return movieAPI.updateMovie(sessionState, movieItem.id,movie).catch(function(e) {
          	console.log('Broken Promise: getPosterFromTMDB(' + movie.id + ').updateMovie()');
          	throw e;
          })
  	    }).catch(function(e) {
  		    console.log('Broken Promise: getPosterFromTMDB().insertPoster()');
  		    throw e;
        })
      }
      else {
      	// Nothing to do
      	return Promise.resolve();
      }
    }).catch(function(e) {
      console.log('Broken Promise: getPosterFromTMDB().');
  	  throw e;
    })
  }
  
  function getPosterBatchFromTMDB(movieItems, batchNo, batchSize, response) {
  
    batch = movieItems.splice(0,batchSize)
    // console.log('getPosterBatchFromTMDB(' + batchNo +',' + batch.length + '): Generating addCastAndCrew() operations.');
     
    var status = {
      date   : dateWithTZOffset(new Date()),
   	  module : 'getPosterBatchFromTMDB()',
    	state  : "Processing",
    	batch  : batchNo
    }
    response.write(JSON.stringify(status));
    response.write(',');
   
    /*
    idList = batch.reduce(
      function(list,movie) {
        list = list + movie.id + ",";
        return list
      },
      ""
    );
    var idList = idList.substring(0,idList.length-1);
    console.log('Adding Batch ' + batchNo + ': [' + idList + '].');
    */
   
    // Create a Batch of getPosterFromTMDB() operations.
    // console.log('getPosterBatchFromTMDB(' + batchNo +'): Generating getPosterFromTMDB operations.');
      
    return Promise.all(batch.map(getPosterFromTMDB)).then(function(){
    	if (movieItems.length > 0) {
        console.log('getPosterBatchFromTMDB(' + batchNo + '): Movies remaining = ' + movieItems.length);
      	batchNo++;
   	    return waitAndRun(movieItems, getPosterBatchFromTMDB, 'getPosterBatchFromTMDB', 'getPosterFromTMDB', batchNo, batchSize,response);
     	}
   		else {
        console.log('getPosterBatchFromTMDB(): getPosterFromTMDB() operations complete');
        var status = {
        date   : dateWithTZOffset(new Date()),
        module : 'getPosterBatchFromTMDB',
        state  : "Completed"
        }
        response.write(JSON.stringify(status))
        response.write(']');
        response.write(',');
    	  response.write('"count":' + posterCount);
        response.write('}');
    	  response.end();
      }
    }).catch(function(e){
   	  throw e
    })
  }
      
  console.log('getPostersFromTMDB()');

  var qbe = { posterURL : { '$ne' : null }}
  
  return movieAPI.queryMovies(sessionState, qbe,'unlimited').then(function(sodaResponse){
  	movieItems = sodaResponse.json;
  	// console.log(JSON.stringify(movieItems).substring(0,9999));
  	console.log('getPostersFromTMDB() : Movie count = ' + movieItems.length);
    return movieAPI.recreatePosterCollection(sessionState)
  }).then(function() {
    response.write('{"status":[') 
    return waitAndRun(movieItems, getPosterBatchFromTMDB, 'getPosterBatchFromTMDB', 'getPosterFromTMDB', 1, 35, response);
  }).catch(function(e){
  	console.log('Broken Promise: getPostersFromTMDB()');
  	throw e;
  });
}

function getCompany(id) {
  
  var moduleId = 'getCompany(' + id + ')';
  // console.log(moduleId);

  return new Promise(
      
    function(resolve, reject) {
                  
      var readResponse = function(response) {
          
        var responseText = '';
            
        response.on(
          'data' ,
          function(chunk) {
           responseText = responseText + chunk;
          }
        )
        
        response.on(
          'end', 
          function () {
            if (response.statusCode == 200) {
              try {
                // console.log(moduleId + '.readResponse()')
                var castAndCrew = JSON.parse(responseText)
                resolve(castAndCrew);
              } catch (e) {
                reject(e);
              }
            }
            else {
              var e = { 
                    module : moduleId + '.readResponse(end)',
                    statusCode : response.statusCode,
                    statusText : http.STATUS_CODES[response.statusCode],
                    requestDetails : options,
                    bytesRecieved : responseText.length,
                    responeText : responseText
                  }
              reject(e)
            }
          }
        )
      }
    
      // console.log('Executing Promise: ' + moduleId);
  
      var path = cfg.dataSources.tmdb.apiPath + '/company/' + id 
                 + '?' + 'api_key=' + cfg.dataSources.tmdb.apiKey
  
      var options = {} 

      if (cfg.dataSources.useProxy) {
        path = cfg.dataSources.tmdb.protocol + '://' + cfg.dataSources.tmdb.hostname + ':' + cfg.dataSources.tmdb.port + path;
        options = {
          hostname : cfg.dataSources.proxy.hostname,
          port     : cfg.dataSources.proxy.port,
          method   : 'GET',
          path     : path,
          headers : {'Content-Type': 'application/json'}
        }
      }
      else {
        options = {
          hostname : cfg.dataSources.tmdb.hostname,
          port     : cfg.dataSources.tmdb.port,
          method   : 'GET',
          path     : path,
          headers : {'Content-Type': 'application/json'}
        }
      };    
  
      var request = http.request(options, readResponse);
      request.on(
        'error', 
        (e) => {
          var details = { 
            module         : moduleId + '.request(error)',
            requestOptions : options,
            cause          : e
          }
          reject(new ExternalError(details));
        }
      );
      request.end();
    }
  )   
}                     

function getCompanyList(sessionState,response) {

  var companies = [];

  function getCompanyFromTMDB(id) {
 
    console.log('getCompanyFromTMDB(' + id + ')');
  	return getCompany(id).then(function(company){
  	  companies.push(company)
    }).catch(function(e) {
      console.log('Broken Promise: getCompany(' + id + ').');
  	  throw e;
    })
  }
  
  function getCompaniesFromTMDB(id, batchNo, batchSize) {

    var startIndex = id[0]
    console.log('getCompaniesFromTMDB(' + id + ')');
		var batch = []
		for (var i = 0; i < batchSize; i++) {
			batch[i] = startIndex+i;
		}

		return Promise.all(batch.map(getCompanyFromTMDB)).then(function(){
    	if (startIndex  < 1000) {
      	batchNo++;
      	startIndex = startIndex + batchSize;
   	    return waitAndRun([startIndex], getCompaniesFromTMDB, 'getCompaniesFromTMDB', 'getCompanyFromTMDB', batchNo, batchSize, null);
     	}
   		else {
        console.log('getCompanyList(): getCompany() operations complete');
			  console.log(JSON.stringify(companies));
        return;
      }
    }).catch(function(e){
   	  throw e
    })
  }
  
  return waitAndRun([1], getCompaniesFromTMDB, 'getCompaniesFromTMDB', 'getCompanyFromTMDB', 1, 36, null);
  
}

function showCompanyList(sessionState, response, next) {

  /* Disable Soda Logging */
  
  var sessionState = sodaLoggingState;

  console.log('externalInterface.showCompanyList()');
  
  getCompanyList(sessionState,response)

}
    
   

       
