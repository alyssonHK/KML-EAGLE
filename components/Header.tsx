
import React from 'react';
import { FaRoute } from 'react-icons/fa';

const Header: React.FC = () => {
  return (
    <header className="bg-white shadow-md z-10">
      <div className="container mx-auto px-4 py-3 flex items-center">
        <FaRoute className="text-2xl text-blue-600 mr-3" />
        <h1 className="text-xl font-bold text-gray-800">Editor Interativo de Rotas KML</h1>
      </div>
    </header>
  );
};

export default Header;
