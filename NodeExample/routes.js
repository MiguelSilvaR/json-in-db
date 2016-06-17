var express = require('express');
var cookieParser = require('cookie-parser');
var movieTicketing = require('./movie_ticketing.js');
var externalInterfaces = require('./external_interfaces.js');

function setSessionId(cookies,sessionState) {
	movieTicketing.setSessionState(cookies,sessionState);

}

function initializeSodaLogging(sessionState) {
  movieTicketing.initializeSodaLogging(sessionState)
	sessionState.save();
}

function getRouter() {
    var router = express.Router();
    
		router.use(function initalizeSession(req, res, next) {
			setSessionId(req.cookies,req.session);
			initializeSodaLogging(req.session);
  		next();
		});

    router.route('/theaters')
        .get(getTheaters);

    router.route('/theaters/:key')
        .get(getTheaters);

    router.route('/theaters/id/:id')
        .get(getTheaterById);

    router.route('/theaters/search/qbe')
        .post(searchTheaters);

    router.route('/theaters/:id/movies/:date')
        .get(getMoviesByTheater);

    router.route('/movies')
        .get(getMovies);

    router.route('/movies/:key')
        .get(getMovies);

    router.route('/movies/id/:id')
        .get(getMovieById);

    router.route('/movies/search/qbe')
        .post(searchMovies);

    router.route('/movies/:id/theaters/:date')
        .get(getTheatersByMovie);

    router.route('/screenings/:key')
        .get(getScreenings);

    router.route('/bookTickets')
        .post(postBookTicket);

    router.route('/poster/:id')
        .get(getPoster);

    router.route('/config/loadMovies')
        .get(getLoadMovies);

    router.route('/config/loadTheaters')
        .get(getLoadTheaters);

    router.route('/config/loadScreenings')
        .get(getLoadScreenings);

    router.route('/config/LoadPosters')
        .get(getLoadPosters);

    router.route('/config/LoadCompanies')
        .get(getLoadCompanies);

    router.route('/movieticketlog/operationId/:id')
        .get(getLogRecordsByOperation);

    return router;
}

module.exports.getRouter = getRouter;

function getTheaters(req, res, next) {
  if (req.params.key) {
    movieTicketing.theaterService(req.session, res, next, req.params.key);
  } 
  else {
    movieTicketing.theatersService(req.session, res, next);
  }
}

function getTheaterById(req, res, next) {
  movieTicketing.theaterByIdService(req.session, res, next, req.params.id);
}

function searchTheaters(req, res, next) {
  movieTicketing.searchTheatersService(req.session, res, next, req.body);
}

function getTheatersByMovie(req, res, next) {
  movieTicketing.theatersByMovieService(req.session, res, next, req.params.id, req.params.date);
}

function getMoviesByTheater(req, res, next) {
  movieTicketing.moviesByTheaterService(req.session, res, next, req.params.id, req.params.date);
}

function getMovies(req, res, next) {
  if (req.params.key) {
	  movieTicketing.movieService(req.session, res, next, req.params.key);
  }
  else {
    movieTicketing.moviesService(req.session, res, next);
  }
}

function getMovieById(req, res, next) {
  movieTicketing.movieByIdService(req.session, res, next, req.params.id);
}

function searchMovies(req, res, next) {
  movieTicketing.searchMoviesService(req.session, res, next, req.body);
}


function getScreenings(req, res, next) {
  if (req.params.key) {
    movieTicketing.screeningService(req.session, res, next, req.params.key);
  } 
  else {
    movieTicketing.screeningsService(req.session, res, next);
  }
}

function getPoster(req, res, next) {
  movieTicketing.posterService(req.session, res, next, req.params.id);
}
function postBookTicket(req, res, next) {
	movieTicketing.bookTicketService(req.session, res, next, req.body)
}

function getLoadMovies(req, res, next) {
  externalInterfaces.loadMovies(req.session, res, next);
}

function getLoadTheaters(req, res, next) {
	externalInterfaces.loadTheaters(req.session, res, next)
}

function getLoadScreenings(req, res, next) {
	externalInterfaces.loadScreenings(req.session, res, next)
}

function getLoadPosters(req, res, next) {
	externalInterfaces.loadPosters(req.session, res, next)
}

function getLoadCompanies(req, res, next) {
	externalInterfaces.showCompanyList(req.session, res, next)
}

function getLogRecordsByOperation(req, res, next) {
  movieTicketing.logRecordsByOperationService(req.session, res, next, req.params.id);
}
