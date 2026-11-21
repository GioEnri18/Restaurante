const multer = require('multer');
const { AppError, BadRequestError } = require('../shared/errors/AppError');

const recibir = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fields: 0, parts: 1, fileSize: 5000000 },
}).single('imagen');

function recibirFotoPlatillo(req, res, next) {
  if (!req.is('multipart/form-data')) {
    next(new AppError('Envía la imagen como multipart/form-data', 415, 'INVALID_UPLOAD_TYPE'));
    return;
  }
  recibir(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('La imagen original no puede superar 5 MB', 413, 'IMAGE_TOO_LARGE'));
      return;
    }
    if (error || !req.file?.size) {
      next(new BadRequestError('Envía un único archivo en el campo imagen'));
      return;
    }
    next();
  });
}

module.exports = { recibirFotoPlatillo };
