import React, { useState, useEffect } from 'react';
import { RouteInfo } from '../types';
import { X } from 'lucide-react';
import Button from './ui/Button';

interface RouteInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (routeInfo: RouteInfo) => void;
  fileName?: string;
}

const RouteInfoModal: React.FC<RouteInfoModalProps> = ({ isOpen, onClose, onSave, fileName }) => {
  const [formData, setFormData] = useState<RouteInfo>({
    nome: '',
    frequencia: '',
    turno: ''
  });

  // Tentar extrair nome do arquivo KML
  useEffect(() => {
    if (fileName && isOpen) {
      const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, "");
      setFormData(prev => ({
        ...prev,
        nome: nameWithoutExtension
      }));
    }
  }, [fileName, isOpen]);

  const handleInputChange = (field: keyof RouteInfo, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  const handleCancel = () => {
    setFormData({
      nome: '',
      frequencia: '',
      turno: ''
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Informações da Rota</h2>
          <button 
            onClick={handleCancel}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">
              Nome da Rota *
            </label>
            <input
              type="text"
              id="nome"
              value={formData.nome}
              onChange={(e) => handleInputChange('nome', e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: Rota Centro - Bairro Norte"
            />
          </div>
          
          <div>
            <label htmlFor="frequencia" className="block text-sm font-medium text-gray-700 mb-1">
              Frequência *
            </label>
            <select
              id="frequencia"
              value={formData.frequencia}
              onChange={(e) => handleInputChange('frequencia', e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Selecione a frequência</option>
              <option value="Diária">Diária</option>
              <option value="SEG - QUA - SEX">SEG - QUA - SEX</option>
              <option value="TER - QUI - SAB">TER - QUI - SAB</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="turno" className="block text-sm font-medium text-gray-700 mb-1">
              Turno *
            </label>
            <select
              id="turno"
              value={formData.turno}
              onChange={(e) => handleInputChange('turno', e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Selecione o turno</option>
              <option value="Matutino">Manhã</option>
              <option value="Vespertino">Tarde</option>
              <option value="Noturno">Noite</option>
              <option value="Integral">Integral</option>
            </select>
          </div>
          
          <div className="flex gap-2 pt-4">
            <Button 
              type="button" 
              onClick={handleCancel} 
              variant="secondary"
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              variant="primary"
              className="flex-1"
            >
              Salvar e Continuar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RouteInfoModal;
